"use client";

import { useEffect, useRef, useState } from "react";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, FilePlus2 } from "lucide-react";
import type { DraftPage } from "@/lib/editor-types";
import type { LocalAsset } from "@/lib/local-db";
import { PageCanvas } from "./page-canvas";

type PageItemProps = {
  page: DraftPage;
  index: number;
  assets: LocalAsset[];
  active: boolean;
  splitMode: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggle: () => void;
};

function LazyThumbnail({ page, assets, eager }: { page: DraftPage; assets: LocalAsset[]; eager: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(eager);
  useEffect(() => {
    if (eager) { setVisible(true); return; }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: "240px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [eager]);
  const rotated = page.rotation % 180 !== 0;
  const width = (rotated ? page.height : page.width) * 0.22;
  const height = (rotated ? page.width : page.height) * 0.22;
  return <div ref={ref} style={{ width, height }}>{visible ? <PageCanvas page={page} assets={assets} thumbnail /> : <div className="h-full w-full animate-pulse bg-[#edf0f5]" />}</div>;
}

function PageItem({ page, index, assets, active, splitMode, checked, onSelect, onToggle }: PageItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={onSelect}
      className={`relative mx-auto mb-2 w-fit rounded-xl border p-2 transition-colors ${active ? "border-[#315ee7] bg-[#eef2ff]" : "border-transparent hover:bg-[#e9edf4]"}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.45 : 1 }}
    >
      <LazyThumbnail page={page} assets={assets} eager={active} />
      {splitMode && (
        <button
          type="button"
          aria-label={`${checked ? "取消选择" : "选择"}第 ${index + 1} 页`}
          aria-pressed={checked}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => { event.stopPropagation(); onToggle(); }}
          className={`absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md border shadow-sm ${checked ? "border-[#315ee7] bg-[#315ee7] text-white" : "border-[#cbd2df] bg-white text-transparent"}`}
        >
          <Check size={14} strokeWidth={3} />
        </button>
      )}
      <span className="mt-2 block text-center text-xs text-[#667085]">{index + 1}</span>
    </div>
  );
}

export function PageSidebar({ pages, assets, activeId, splitMode, selectedIds, onSelect, onToggle, onReorder, onAddFiles }: {
  pages: DraftPage[];
  assets: LocalAsset[];
  activeId: string;
  splitMode: boolean;
  selectedIds: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onReorder: (event: DragEndEvent) => void;
  onAddFiles: (files: FileList | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  return (
    <aside className="w-48 shrink-0 overflow-y-auto border-r border-[#dfe3ea] bg-[#f8f9fb] py-4">
      <DndContext sensors={sensors} onDragEnd={onReorder}>
        <SortableContext items={pages.map((page) => page.id)} strategy={verticalListSortingStrategy}>
          {pages.map((page, index) => (
            <PageItem key={page.id} page={page} index={index} assets={assets} active={page.id === activeId} splitMode={splitMode} checked={selectedIds.has(page.id)} onSelect={() => onSelect(page.id)} onToggle={() => onToggle(page.id)} />
          ))}
        </SortableContext>
      </DndContext>
      <button type="button" onClick={() => inputRef.current?.click()} className="mx-auto mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-[#315ee7] hover:bg-[#eef2ff]">
        <FilePlus2 size={15} />合并更多 PDF
      </button>
      <input ref={inputRef} hidden type="file" multiple accept="application/pdf" onChange={(event) => { onAddFiles(event.target.files); event.target.value = ""; }} />
    </aside>
  );
}
