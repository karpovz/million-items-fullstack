import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BATCH_INTERVAL_MS } from "@million/shared";
import { getState } from "../api";
import { AddItemsForm } from "./AddItemsForm";
import { ListPanel } from "./ListPanel";

export function Workspace() {
  const state = useQuery({
    queryKey: ["state"],
    queryFn: getState,
    refetchInterval: BATCH_INTERVAL_MS,
  });
  const client = useQueryClient();
  const previousRevision = useRef<number | undefined>(undefined);
  useEffect(() => {
    const revision = state.data?.revision;
    if (revision === undefined) return;
    if (
      previousRevision.current !== undefined &&
      previousRevision.current !== revision
    )
      void client.invalidateQueries(
        { queryKey: ["items"] },
        { cancelRefetch: false },
      );
    previousRevision.current = revision;
  }, [client, state.data?.revision]);
  return (
    <main>
      {state.isError && <p role="alert">Нет соединения с сервером</p>}
      <div className="lists">
        <ListPanel kind="available" title="Доступные элементы">
          <AddItemsForm />
        </ListPanel>
        <ListPanel kind="selected" title="Выбранные элементы" />
      </div>
    </main>
  );
}
