import type { ItemId } from "@million/shared";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ROW_HEIGHT } from "../constants";

export function ItemRow({
  id,
  kind,
  index,
  onToggle,
  disabled,
}: {
  id: ItemId;
  kind: "available" | "selected";
  index: number;
  onToggle: (id: ItemId) => void;
  disabled: boolean;
}) {
  const sortable = useSortable({
    id,
    disabled: kind === "available" || disabled,
  });
  return (
    <li
      ref={sortable.setNodeRef}
      className="item-row"
      style={{
        top: index * ROW_HEIGHT,
        transform: CSS.Transform.toString(sortable.transform),
        transition: sortable.transition,
        opacity: sortable.isDragging ? 0 : 1,
      }}
    >
      {kind === "selected" && (
        <button
          className="drag"
          aria-label={`Переместить ID ${id}`}
          {...sortable.attributes}
          {...sortable.listeners}
          disabled={disabled}
        >
          ⠿
        </button>
      )}
      <span title={String(id)}>{id}</span>
      <button
        className="toggle"
        disabled={disabled}
        onClick={() => onToggle(id)}
        aria-label={`${kind === "available" ? "Выбрать" : "Убрать из выбранных"} ID ${id}`}
      >
        {kind === "available" ? "+" : "−"}
      </button>
    </li>
  );
}
