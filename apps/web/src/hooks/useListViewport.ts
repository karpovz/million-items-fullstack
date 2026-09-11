import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type UIEvent,
} from "react";
import type { ItemId } from "@million/shared";

import { ROW_HEIGHT } from "../constants";
const OVERSCAN = 10;

export function useListViewport(
  shown: ItemId[],
  activeId: ItemId | null,
  search: string,
) {
  const panel = useRef<HTMLElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const [viewport, setViewport] = useState({ top: 0, height: 600, offset: 0 });
  useLayoutEffect(() => {
    const node = panel.current!;
    const measure = () =>
      setViewport({
        top: node.scrollTop,
        height: node.clientHeight || 600,
        offset: list.current?.offsetTop ?? 0,
      });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (list.current) observer.observe(list.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    panel.current?.scrollTo?.({ top: 0 });
    setViewport((current) => ({ ...current, top: 0 }));
  }, [search]);
  const start = Math.min(
    shown.length,
    Math.max(
      0,
      Math.floor((viewport.top - viewport.offset) / ROW_HEIGHT) - OVERSCAN,
    ),
  );
  const end = Math.min(
    shown.length,
    Math.max(
      start,
      Math.ceil(
        (viewport.top + viewport.height - viewport.offset) / ROW_HEIGHT,
      ) + OVERSCAN,
    ),
  );
  const indices = Array.from(
    { length: end - start },
    (_, index) => start + index,
  );
  const activeIndex = activeId === null ? -1 : shown.indexOf(activeId);
  if (activeIndex >= 0 && (activeIndex < start || activeIndex >= end))
    indices.push(activeIndex);
  function onScroll(event: UIEvent<HTMLElement>) {
    const node = event.currentTarget;
    setViewport({
      top: node.scrollTop,
      height: node.clientHeight,
      offset: list.current?.offsetTop ?? 0,
    });
  }
  return { panel, list, indices, onScroll };
}
