"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import type { DraftPage, EditorObject } from "@/lib/editor-types";
import type { LocalAsset } from "@/lib/local-db";
import { getCachedPdfDocument } from "@/lib/pdfjs-cache";
import { useEditor } from "@/lib/editor-store";

type Props = { page: DraftPage; assets: LocalAsset[]; thumbnail?: boolean };

export function PageCanvas({ page, assets, thumbnail = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [error, setError] = useState("");
  const { draft, zoom, tool, selectedId, select, commit, updateObject } = useEditor();
  const renderZoom = thumbnail ? 0.22 : zoom;

  useEffect(() => {
    let active = true;
    let task: { cancel: () => void } | undefined;
    let delay: ReturnType<typeof setTimeout> | undefined;

    void (async () => {
      try {
        setError("");
        if (thumbnail) await new Promise<void>((resolve) => { delay = setTimeout(resolve, 140); });
        if (!active) return;
        const asset = assets.find((item) => item.id === page.sourceAssetId);
        if (!asset) return;
        const document = await getCachedPdfDocument(asset.data);
        const pdfPage: PDFPageProxy = await document.getPage(page.sourcePageIndex + 1);
        if (!active) return;

        const nextViewport = pdfPage.getViewport({ scale: renderZoom, rotation: (pdfPage.rotate + page.rotation) % 360 });
        const ratio = thumbnail ? 1 : Math.min(window.devicePixelRatio || 1, 2);
        const scratch = window.document.createElement("canvas");
        scratch.width = Math.floor(nextViewport.width * ratio);
        scratch.height = Math.floor(nextViewport.height * ratio);
        const context = scratch.getContext("2d")!;
        task = pdfPage.render({
          canvasContext: context,
          viewport: nextViewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
          canvas: scratch,
        });
        await (task as unknown as { promise: Promise<void> }).promise;
        if (!active) return;

        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = scratch.width;
        canvas.height = scratch.height;
        canvas.style.width = `${nextViewport.width}px`;
        canvas.style.height = `${nextViewport.height}px`;
        canvas.getContext("2d")!.drawImage(scratch, 0, 0);
        setViewport(nextViewport);
      } catch (caught) {
        if (active) setError(caught instanceof Error && /password|encrypt/i.test(caught.message) ? "暂不支持加密 PDF" : "页面无法显示");
      }
    })();

    return () => {
      active = false;
      if (delay) clearTimeout(delay);
      task?.cancel();
    };
  }, [assets, page.sourceAssetId, page.sourcePageIndex, page.rotation, renderZoom, thumbnail]);

  const objects = draft.objects.filter((object) => object.pageId === page.id);
  const rotated = page.rotation % 180 !== 0;
  const fallbackWidth = (rotated ? page.height : page.width) * renderZoom;
  const fallbackHeight = (rotated ? page.width : page.height) * renderZoom;

  function bounds(object: EditorObject) {
    if (!viewport) return { left: 0, top: 0, width: 0, height: 0 };
    const first = viewport.convertToViewportPoint(object.x, object.y);
    const second = viewport.convertToViewportPoint(object.x + object.width, object.y + object.height);
    return { left: Math.min(first[0], second[0]), top: Math.min(first[1], second[1]), width: Math.abs(second[0] - first[0]), height: Math.abs(second[1] - first[1]) };
  }

  function addAt(event: React.MouseEvent) {
    if (thumbnail || tool === "select" || tool === "image" || tool === "signature" || !viewport) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
    const object: EditorObject = { id: crypto.randomUUID(), pageId: page.id, type: tool, x, y: tool === "line" ? y : y - 35, width: tool === "text" ? 150 : 120, height: tool === "text" ? 28 : tool === "line" ? 1 : 60, color: tool === "highlight" ? "#f6c945" : "#315ee7", opacity: tool === "highlight" ? 0.38 : 1, text: tool === "text" ? "双击输入文字" : undefined, fontSize: tool === "text" ? 18 : undefined };
    commit((value) => ({ ...value, objects: [...value.objects, object] }));
    select(object.id);
  }

  function startDrag(event: React.PointerEvent, object: EditorObject) {
    if (thumbnail) return;
    event.stopPropagation();
    select(object.id);
    const start = [event.clientX, event.clientY];
    const original = [object.x, object.y];
    const move = (nextEvent: PointerEvent) => {
      if (!viewport) return;
      const origin = viewport.convertToPdfPoint(0, 0);
      const delta = viewport.convertToPdfPoint(nextEvent.clientX - start[0], nextEvent.clientY - start[1]);
      useEditor.setState((state) => ({ draft: { ...state.draft, objects: state.draft.objects.map((item) => item.id === object.id ? { ...item, x: original[0] + delta[0] - origin[0], y: original[1] + delta[1] - origin[1] } : item) } }));
    };
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  return (
    <div
      data-pdf-page-id={thumbnail ? undefined : page.id}
      aria-busy={!viewport && !error}
      onClick={addAt}
      className={`relative shrink-0 overflow-hidden bg-white ${thumbnail ? "" : "paper-shadow"}`}
      style={{ width: viewport?.width || fallbackWidth, height: viewport?.height || fallbackHeight }}
    >
      <canvas ref={canvasRef} />
      {!viewport && !error && <div className="absolute inset-0 grid place-items-center bg-white"><span className={`rounded-full bg-[#eef2ff] text-[#667085] ${thumbnail ? "h-5 w-16 animate-pulse" : "px-4 py-2 text-sm"}`}>{thumbnail ? "" : "正在载入页面…"}</span></div>}
      {error && <div className="absolute inset-0 grid place-items-center text-sm text-red-600">{error}</div>}
      {!thumbnail && viewport && objects.map((object) => {
        const box = bounds(object);
        const selected = object.id === selectedId;
        return <div key={object.id} onPointerDown={(event) => startDrag(event, object)} onDoubleClick={() => { if (object.type === "text") { const text = prompt("输入文字", object.text); if (text !== null) updateObject(object.id, { text }); } }} className={`absolute touch-none ${selected ? "ring-2 ring-[#315ee7] ring-offset-2" : ""}`} style={{ left: box.left, top: box.top, width: Math.max(box.width, 8), height: Math.max(box.height, 4), opacity: object.opacity, color: object.color, cursor: "move" }}>{object.type === "text" ? <span style={{ fontSize: (object.fontSize || 18) * zoom, whiteSpace: "nowrap" }}>{object.text}</span> : object.type === "image" || object.type === "signature" ? <img draggable={false} src={object.dataUrl} alt="新增图片" className="h-full w-full object-contain" /> : object.type === "line" ? <svg className="h-full w-full overflow-visible"><line x1="0" y1="0" x2="100%" y2="100%" stroke={object.color} strokeWidth="2" /></svg> : <div className="h-full w-full" style={{ border: object.type === "rect" ? `2px solid ${object.color}` : undefined, background: object.type === "highlight" ? object.color : undefined }} />}</div>;
      })}
    </div>
  );
}
