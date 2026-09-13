"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFPageProxy, PageViewport } from "pdfjs-dist";
import type { DraftPage, EditorObject } from "@/lib/editor-types";
import type { LocalAsset } from "@/lib/local-db";
import { getCachedPdfDocument } from "@/lib/pdfjs-cache";
import { useEditor } from "@/lib/editor-store";
import { ColorPicker } from "./color-picker";

type Props = { page: DraftPage; assets: LocalAsset[]; thumbnail?: boolean };
type PdfRect = { x: number; y: number; width: number; height: number };
type TextSelection = { left: number; top: number; rects: PdfRect[] };
const highlightColors = [
  { name: "黄色", value: "#f6c945" },
  { name: "绿色", value: "#75c88a" },
  { name: "粉色", value: "#f28aa9" },
  { name: "蓝色", value: "#7aa7ff" },
] as const;

export function PageCanvas({ page, assets, thumbnail = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const drawingRef = useRef<{ x: number; y: number } | null>(null);
  const [viewport, setViewport] = useState<PageViewport | null>(null);
  const [textSelection, setTextSelection] = useState<TextSelection | null>(null);
  const [drawing, setDrawing] = useState<EditorObject | null>(null);
  const [error, setError] = useState("");
  const { draft, zoom, tool, selectedId, select, commit, updateObject } = useEditor();
  const renderZoom = thumbnail ? 0.22 : zoom;

  useEffect(() => {
    let active = true;
    let task: { cancel: () => void } | undefined;
    let textTask: { cancel: () => void } | undefined;
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

        if (!thumbnail && textLayerRef.current) {
          const textContainer = textLayerRef.current;
          textContainer.replaceChildren();
          textContainer.style.setProperty("--total-scale-factor", String(nextViewport.scale));
          const pdfjs = await import("pdfjs-dist");
          textTask = new pdfjs.TextLayer({
            textContentSource: pdfPage.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
            container: textContainer,
            viewport: nextViewport,
          });
          await (textTask as unknown as { render: () => Promise<void> }).render();
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error && /password|encrypt/i.test(caught.message) ? "暂不支持加密 PDF" : "页面无法显示");
      }
    })();

    return () => {
      active = false;
      if (delay) clearTimeout(delay);
      task?.cancel();
      textTask?.cancel();
    };
  }, [assets, page.sourceAssetId, page.sourcePageIndex, page.rotation, renderZoom, thumbnail]);

  const objects = draft.objects.filter((object) => object.pageId === page.id);
  const rotated = page.rotation % 180 !== 0;
  const fallbackWidth = (rotated ? page.height : page.width) * renderZoom;
  const fallbackHeight = (rotated ? page.width : page.height) * renderZoom;

  useEffect(() => {
    if (tool !== "select" && tool !== "highlight") {
      setTextSelection(null);
      window.getSelection()?.removeAllRanges();
    }
  }, [tool]);

  function bounds(object: EditorObject) {
    if (!viewport) return { left: 0, top: 0, width: 0, height: 0 };
    const first = viewport.convertToViewportPoint(object.x, object.y);
    const second = viewport.convertToViewportPoint(object.x + object.width, object.y + object.height);
    const left = Math.min(first[0], second[0]);
    const top = Math.min(first[1], second[1]);
    return { left, top, width: Math.abs(second[0] - first[0]), height: Math.abs(second[1] - first[1]), startX: first[0] - left, startY: first[1] - top, endX: second[0] - left, endY: second[1] - top };
  }

  function addAt(event: React.MouseEvent) {
    if (thumbnail || tool === "select" || tool === "highlight" || tool === "image" || tool === "signature" || tool === "rect" || tool === "line" || !viewport) return;
    if (event.target instanceof Element && event.target.closest(".pdf-text-layer")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const [x, y] = viewport.convertToPdfPoint(event.clientX - rect.left, event.clientY - rect.top);
    const object: EditorObject = { id: crypto.randomUUID(), pageId: page.id, type: tool, x, y: y - 35, width: tool === "text" ? 150 : 120, height: tool === "text" ? 28 : 60, color: "#315ee7", opacity: 1, text: tool === "text" ? "双击输入文字" : undefined, fontSize: tool === "text" ? 18 : undefined };
    commit((value) => ({ ...value, objects: [...value.objects, object] }));
    select(object.id);
  }

  function pagePoint(event: Pick<PointerEvent, "clientX" | "clientY">) {
    const element = pageRef.current;
    if (!element || !viewport) return null;
    const rect = element.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
    const [pdfX, pdfY] = viewport.convertToPdfPoint(x, y);
    return { x: pdfX, y: pdfY };
  }

  function startDrawing(event: React.PointerEvent<HTMLDivElement>) {
    if (thumbnail || !viewport || (tool !== "rect" && tool !== "line")) return;
    event.preventDefault();
    const start = pagePoint(event.nativeEvent);
    if (!start) return;
    drawingRef.current = start;
    const preview: EditorObject = { id: "drawing-preview", pageId: page.id, type: tool, x: start.x, y: start.y, width: 0, height: 0, color: "#315ee7", opacity: 1 };
    setDrawing(preview);

    const move = (nextEvent: PointerEvent) => {
      const end = pagePoint(nextEvent);
      const origin = drawingRef.current;
      if (!end || !origin) return;
      setDrawing({ ...preview, x: tool === "rect" ? Math.min(origin.x, end.x) : origin.x, y: tool === "rect" ? Math.min(origin.y, end.y) : origin.y, width: tool === "rect" ? Math.abs(end.x - origin.x) : end.x - origin.x, height: tool === "rect" ? Math.abs(end.y - origin.y) : end.y - origin.y });
    };
    const up = (nextEvent: PointerEvent) => {
      const end = pagePoint(nextEvent);
      const origin = drawingRef.current;
      drawingRef.current = null;
      setDrawing(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (!end || !origin) return;
      const width = end.x - origin.x;
      const height = end.y - origin.y;
      if (Math.abs(width) < 2 && Math.abs(height) < 2) return;
      const object: EditorObject = { ...preview, id: crypto.randomUUID(), x: tool === "rect" ? Math.min(origin.x, end.x) : origin.x, y: tool === "rect" ? Math.min(origin.y, end.y) : origin.y, width: tool === "rect" ? Math.abs(width) : width, height: tool === "rect" ? Math.abs(height) : height };
      commit((value) => ({ ...value, objects: [...value.objects, object] }));
      select(object.id);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  function addTextHighlights(rects: PdfRect[], color: string) {
    if (!rects.length) return;
    const highlights: EditorObject[] = rects.map((rect) => ({ id: crypto.randomUUID(), pageId: page.id, type: "highlight", ...rect, color, opacity: 0.38 }));
    commit((value) => ({ ...value, objects: [...value.objects, ...highlights] }));
    select(highlights.at(-1)!.id);
    setTextSelection(null);
    window.getSelection()?.removeAllRanges();
  }

  function finishTextSelection() {
    const selection = window.getSelection();
    const layer = textLayerRef.current;
    const pageElement = pageRef.current;
    if (!selection || selection.isCollapsed || !selection.rangeCount || !layer || !pageElement || !viewport) return;
    const belongsToLayer = (node: Node | null) => Boolean(node && layer.contains(node instanceof Element ? node : node.parentElement));
    if (!belongsToLayer(selection.anchorNode) && !belongsToLayer(selection.focusNode)) return;

    const pageBox = pageElement.getBoundingClientRect();
    const rawRects = Array.from(selection.getRangeAt(0).getClientRects())
      .map((rect) => ({ left: Math.max(rect.left, pageBox.left), right: Math.min(rect.right, pageBox.right), top: Math.max(rect.top, pageBox.top), bottom: Math.min(rect.bottom, pageBox.bottom) }))
      .filter((rect) => rect.right - rect.left > 1 && rect.bottom - rect.top > 1)
      .sort((first, second) => Math.abs(first.top - second.top) < 4 ? first.left - second.left : first.top - second.top);

    const merged = rawRects.reduce<typeof rawRects>((lines, rect) => {
      const previous = lines.at(-1);
      if (previous && Math.abs(previous.top - rect.top) < 4 && rect.left - previous.right < 12) {
        previous.right = Math.max(previous.right, rect.right);
        previous.bottom = Math.max(previous.bottom, rect.bottom);
      } else lines.push({ ...rect });
      return lines;
    }, []);

    const rects = merged.map((rect) => {
      const first = viewport.convertToPdfPoint(rect.left - pageBox.left, rect.top - pageBox.top);
      const second = viewport.convertToPdfPoint(rect.right - pageBox.left, rect.bottom - pageBox.top);
      return { x: Math.min(first[0], second[0]), y: Math.min(first[1], second[1]), width: Math.abs(second[0] - first[0]), height: Math.abs(second[1] - first[1]) };
    });
    if (!rects.length) return;

    const first = merged[0];
    const last = merged.at(-1)!;
    setTextSelection({ left: Math.max(8, Math.min((first.left + last.right) / 2 - pageBox.left - 116, pageBox.width - 240)), top: Math.max(8, first.top - pageBox.top - 50), rects });
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
      ref={pageRef}
      data-pdf-page-id={thumbnail ? undefined : page.id}
      aria-busy={!viewport && !error}
      onClick={addAt}
      onPointerDown={startDrawing}
      className={`relative shrink-0 overflow-hidden bg-white ${thumbnail ? "" : "paper-shadow"}`}
      style={{ width: viewport?.width || fallbackWidth, height: viewport?.height || fallbackHeight }}
    >
      <canvas ref={canvasRef} />
      {!thumbnail && <div ref={textLayerRef} aria-label="PDF 原文文本层" onPointerDown={() => { setTextSelection(null); select(null); }} onMouseUp={finishTextSelection} className={`pdf-text-layer ${tool === "select" || tool === "highlight" ? "" : "pointer-events-none select-none"}`} />}
      {!viewport && !error && <div className="absolute inset-0 grid place-items-center bg-white"><span className={`rounded-full bg-[#eef2ff] text-[#667085] ${thumbnail ? "h-5 w-16 animate-pulse" : "px-4 py-2 text-sm"}`}>{thumbnail ? "" : "正在载入页面…"}</span></div>}
      {error && <div className="absolute inset-0 grid place-items-center text-sm text-red-600">{error}</div>}
      {!thumbnail && viewport && [...objects, ...(drawing ? [drawing] : [])].map((object) => {
        const box = bounds(object);
        const preview = object.id === "drawing-preview";
        const selected = !preview && object.id === selectedId;
        return <div key={object.id} data-editor-object-type={preview ? undefined : object.type} data-editor-preview={preview || undefined} onPointerDown={preview ? undefined : (event) => startDrag(event, object)} onDoubleClick={() => { if (object.type === "text") { const text = prompt("输入文字", object.text); if (text !== null) updateObject(object.id, { text }); } }} className={`absolute z-20 touch-none ${selected ? "ring-2 ring-[#315ee7] ring-offset-2" : ""}`} style={{ left: box.left, top: box.top, width: Math.max(box.width, 2), height: Math.max(box.height, 2), opacity: object.opacity, color: object.color, cursor: preview ? "crosshair" : "move", pointerEvents: preview ? "none" : undefined }}>{object.type === "text" ? <span style={{ fontSize: (object.fontSize || 18) * zoom, whiteSpace: "nowrap" }}>{object.text}</span> : object.type === "image" || object.type === "signature" ? <img draggable={false} src={object.dataUrl} alt="新增图片" className="h-full w-full object-contain" /> : object.type === "line" ? <svg className="h-full w-full overflow-visible"><line x1={box.startX} y1={box.startY} x2={box.endX} y2={box.endY} stroke={object.color} strokeWidth="2" vectorEffect="non-scaling-stroke" /></svg> : <div className="h-full w-full" style={{ border: object.type === "rect" ? `2px solid ${object.color}` : undefined, background: object.type === "highlight" ? object.color : undefined }} />}</div>;
      })}
      {textSelection && <div role="toolbar" aria-label="高亮颜色" onPointerDown={(event) => { if (!(event.target instanceof HTMLInputElement)) event.preventDefault(); }} className="absolute z-30 flex h-10 items-center gap-1 rounded-xl border border-[#e5e9f0] bg-white px-2 shadow-[0_8px_24px_rgba(23,34,59,.18)]" style={{ left: textSelection.left, top: textSelection.top }}><span className="mr-1 text-xs font-semibold text-[#344054]">高亮</span>{highlightColors.map((color) => <button key={color.value} type="button" aria-label={`${color.name}高亮`} onClick={() => addTextHighlights(textSelection.rects, color.value)} className="h-6 w-6 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(23,34,59,.14)] transition-transform duration-150 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ee7] active:scale-95" style={{ backgroundColor: color.value }} />)}<ColorPicker value="#F6C945" onChange={(color) => addTextHighlights(textSelection.rects, color)} ariaLabel="自定义高亮颜色" compact confirmLabel="应用此颜色" /></div>}
    </div>
  );
}
