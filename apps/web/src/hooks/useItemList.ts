import { useEffect, useMemo, useRef, useState } from "react";
import type { ItemId } from "@million/shared";
import type { DragEndEvent } from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import {
  QueryClient,
  useInfiniteQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { getPage, reorderIds, selectId } from "../api";
import { CHANGE_REFRESH_MS } from "../constants";
import { useDebounced } from "./useDebounced";

// Обе панели используют общий таймер для одного кеша запросов.
const refreshTimers = new WeakMap<QueryClient, number>();
function operationRefresh(client: QueryClient) {
  if (refreshTimers.has(client)) return;
  refreshTimers.set(
    client,
    window.setTimeout(() => {
      refreshTimers.delete(client);
      void client.invalidateQueries(
        { queryKey: ["items"] },
        { cancelRefetch: false },
      );
    }, CHANGE_REFRESH_MS),
  );
}

export function useItemList(kind: "available" | "selected") {
  const [input, setInput] = useState("");
  const search = useDebounced(input);
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["items", kind, search],
    queryFn: ({ pageParam, signal }) =>
      getPage(kind, search, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.nextCursor,
  });
  const items = useMemo(
    () => [...new Set(query.data?.pages.flatMap((page) => page.items) ?? [])],
    [query.data],
  );
  const [hidden, setHidden] = useState<ItemId[]>([]);
  const [optimisticOrder, setOptimisticOrder] = useState<ItemId[] | null>(null);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState<ItemId | null>(null);
  const dragVersion = useRef(0);
  useEffect(() => {
    setHidden([]);
    setOptimisticOrder(null);
    setError("");
    dragVersion.current++;
  }, [search]);
  // Подгрузка страницы не должна возвращать строку, пока сервер обрабатывает выбор.
  useEffect(() => {
    setHidden((current) => current.filter((id) => items.includes(id)));
  }, [items]);
  const shown = useMemo(() => {
    const removed = new Set(hidden);
    const visible = items.filter((id) => !removed.has(id));
    if (kind !== "selected" || !optimisticOrder) return visible;
    const membership = new Set(visible),
      ordered = new Set(optimisticOrder);
    return [
      ...optimisticOrder.filter((id) => membership.has(id)),
      ...visible.filter((id) => !ordered.has(id)),
    ];
  }, [items, hidden, kind, optimisticOrder]);
  async function toggle(id: ItemId) {
    setError("");
    setHidden((current) => [...current, id]);
    try {
      await selectId(id, kind === "available");
      operationRefresh(queryClient);
    } catch {
      setHidden((current) => current.filter((value) => value !== id));
      setError("Не удалось изменить выбор. Повторите попытку.");
    }
  }
  async function dragEnd(event: DragEndEvent) {
    setActiveId(null);
    if (event.over == null) return;
    const active = event.active.id,
      over = event.over.id;
    if (active === over) return;
    const from = shown.indexOf(active),
      to = shown.indexOf(over);
    if (from < 0 || to < 0) return;
    const version = ++dragVersion.current;
    setError("");
    setOptimisticOrder(arrayMove(shown, from, to));
    try {
      await reorderIds(search, active, over);
      await new Promise((resolve) =>
        window.setTimeout(resolve, CHANGE_REFRESH_MS),
      );
      await queryClient.invalidateQueries(
        { queryKey: ["items"] },
        { cancelRefetch: false },
      );
    } catch {
      setError("Не удалось изменить порядок. Повторите попытку.");
    } finally {
      // Ответ старого переноса не сбрасывает более новую перестановку.
      if (version === dragVersion.current) setOptimisticOrder(null);
    }
  }
  return {
    input,
    setInput,
    search,
    query,
    shown,
    error,
    activeId,
    setActiveId,
    toggle,
    dragEnd,
  };
}
