"use client";

/* A vertical list reordered by dragging a handle. Works with mouse, touch, and keyboard
   (focus the handle, press Space to pick up, arrow keys to move, Space to drop). */

import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";

export function SortableList<T extends { id: string }>({
  id,
  items,
  onReorder,
  itemClassName,
  children,
}: {
  /** Stable ID for this list (keeps accessibility IDs consistent). */
  id: string;
  items: T[];
  onReorder: (items: T[]) => void;
  itemClassName?: (item: T, index: number) => string;
  children: (item: T, index: number) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    if (from >= 0 && to >= 0) onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext id={id} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ol className="bullets sortable">
          {items.map((item, index) => (
            <SortableItem key={item.id} id={item.id} index={index} className={itemClassName?.(item, index)}>
              {children(item, index)}
            </SortableItem>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  index,
  className,
  children,
}: {
  id: string;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      className={[className, isDragging ? "dragging" : ""].filter(Boolean).join(" ")}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="handle"
        aria-label={`Drag to reorder item ${index + 1}`}
        {...attributes}
        {...listeners}
      >
        <span aria-hidden="true">⠿</span>
        <span className="pos">{index + 1}</span>
      </button>
      <div className="item-body">{children}</div>
    </li>
  );
}
