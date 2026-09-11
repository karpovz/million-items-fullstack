import { useEffect, useRef, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useItemList } from "../hooks/useItemList";
import { useListViewport } from "../hooks/useListViewport";
import { ROW_HEIGHT } from "../constants";
import { ItemRow } from "./ItemRow";
import { SearchInput } from "./SearchInput";

export function ListPanel({
  kind,
  title,
  children,
}: {
  kind: "available" | "selected";
  title: string;
  children?: ReactNode;
}) {
  const {
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
  } = useItemList(kind);
  const { panel, list, indices, onScroll } = useListViewport(
    shown,
    activeId,
    search,
  );
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = sentinel.current;
    if (!node || !query.hasNextPage || query.isFetching) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting)
          void query.fetchNextPage({ cancelRefetch: false });
      },
      { root: panel.current, rootMargin: "0px 0px 160px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [query.hasNextPage, query.isFetching, query.fetchNextPage]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  return (
    <section
      ref={panel}
      className="panel"
      role="region"
      aria-label={title}
      onScroll={onScroll}
    >
      <div className="controls">
        <SearchInput
          title={title}
          value={input}
          onChange={setInput}
          disabled={activeId !== null}
        />
        {children}
      </div>
      {query.isPending && <p role="status">Загрузка…</p>}
      {query.isError && (
        <p role="alert">
          Не удалось загрузить список.{" "}
          <button onClick={() => void query.refetch()}>Повторить</button>
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={(event) => setActiveId(event.active.id)}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={dragEnd}
      >
        <SortableContext items={shown} strategy={verticalListSortingStrategy}>
          <ul
            ref={list}
            aria-label={title}
            style={{ height: shown.length * ROW_HEIGHT }}
          >
            {indices.map((index) => (
              <ItemRow
                key={shown[index]!}
                id={shown[index]!}
                index={index}
                kind={kind}
                onToggle={toggle}
                disabled={input !== search}
              />
            ))}
          </ul>
        </SortableContext>
        <DragOverlay>
          {activeId !== null ? (
            <div className="drag-overlay">{activeId}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {!query.isPending && !query.isError && !shown.length && (
        <p>Нет элементов</p>
      )}
      <div ref={sentinel} className="sentinel" aria-hidden="true" />
      {query.isFetchingNextPage && <p role="status">Загрузка…</p>}
    </section>
  );
}
