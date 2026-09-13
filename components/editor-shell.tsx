"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import JSZip from "jszip";
import {
  ArrowLeft, ChevronDown, Download, Highlighter, Image as ImageIcon, Minus,
  MousePointer2, PanelLeft, PenLine, Redo2, RotateCw, Save, SlidersHorizontal, Square, Trash2, Type, Undo2,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { Brand } from "./brand";
import { ObjectProperties } from "./object-properties";
import { PageCanvas } from "./page-canvas";
import { PageSidebar } from "./page-sidebar";
import { PdfTaskBar } from "./pdf-task-bar";
import { useEditor } from "@/lib/editor-store";
import type { DraftPage, EditorObject, Tool } from "@/lib/editor-types";
import { downloadBytes, exportPdf, fileDataUrl, pdfPages } from "@/lib/pdf-engine";
import { getDocument, putDocument, type LocalAsset, type LocalDocument } from "@/lib/local-db";

const toolGroups: { id: Tool; label: string; icon: React.ElementType; shortcut?: string; hint: string }[][] = [
  [
    { id: "select", label: "选择", icon: MousePointer2, shortcut: "V", hint: "拖选原文可复制，选中后可一键高亮" },
    { id: "text", label: "文字", icon: Type, shortcut: "T", hint: "点击页面添加文字" },
    { id: "image", label: "图片", icon: ImageIcon, hint: "插入 JPG 或 PNG 图片" },
  ],
  [
    { id: "highlight", label: "高亮", icon: Highlighter, shortcut: "H", hint: "拖选 PDF 原文，再从悬浮色板选择颜色" },
    { id: "rect", label: "矩形", icon: Square, shortcut: "R", hint: "在页面上拖拽绘制矩形标记" },
    { id: "line", label: "线条", icon: Minus, shortcut: "L", hint: "在页面上拖拽绘制线条" },
  ],
  [{ id: "signature", label: "签名", icon: PenLine, hint: "手写并放置签名" }],
];
const tools = toolGroups.flat();

function LazyPage({ page, assets, onVisible, priority = false }: { page: DraftPage; assets: LocalAsset[]; onVisible: (id: string) => void; priority?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(priority);
  const zoom = useEditor((state) => state.zoom);
  useEffect(() => {
    if (priority) { setVisible(true); return; }
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [priority]);
  const rotated = page.rotation % 180 !== 0;
  return (
    <div ref={ref} id={`page-${page.id}`} onMouseEnter={() => onVisible(page.id)} style={!visible ? { width: (rotated ? page.height : page.width) * zoom, height: (rotated ? page.width : page.height) * zoom } : undefined}>
      {visible && <PageCanvas page={page} assets={assets} />}
    </div>
  );
}

function SignatureDialog({ onClose, onDone }: { onClose: () => void; onDone: (data: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d")!;
    context.lineWidth = 3; context.lineCap = "round"; context.strokeStyle = "#17223b";
    const position = (event: PointerEvent) => { const rect = canvas.getBoundingClientRect(); return [(event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height]; };
    const down = (event: PointerEvent) => { drawing.current = true; const [x, y] = position(event); context.beginPath(); context.moveTo(x, y); };
    const move = (event: PointerEvent) => { if (!drawing.current) return; const [x, y] = position(event); context.lineTo(x, y); context.stroke(); };
    const up = () => { drawing.current = false; };
    canvas.addEventListener("pointerdown", down); canvas.addEventListener("pointermove", move); window.addEventListener("pointerup", up);
    return () => { canvas.removeEventListener("pointerdown", down); canvas.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#17223b]/50 p-6">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <h2 className="text-xl font-semibold">手写签名</h2><p className="mb-4 mt-1 text-sm text-[#667085]">签名会作为图像放入当前文档。</p>
        <canvas ref={ref} width={900} height={300} className="h-44 w-full touch-none rounded-xl border border-[#d8deea] bg-white" />
        <div className="mt-5 flex justify-between"><button onClick={() => ref.current?.getContext("2d")?.clearRect(0, 0, 900, 300)} className="rounded-lg px-4 py-2 text-sm hover:bg-[#f2f4f7]">清空</button><div className="flex gap-2"><button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-[#f2f4f7]">取消</button><button onClick={() => onDone(ref.current!.toDataURL("image/png"))} className="rounded-lg bg-[#315ee7] px-5 py-2 text-sm font-semibold text-white">使用签名</button></div></div>
      </div>
    </div>
  );
}

function parsePageExpression(value: string, pageCount: number) {
  const normalized = value.replace(/[，、]/g, ",").replace(/[–—]/g, "-").trim();
  if (!normalized) return { pages: [] as number[] };
  const pages = new Set<number>();
  for (const part of normalized.split(",")) {
    const match = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
    if (!match) return { pages: [] as number[], error: "请输入页码或范围，例如 5-10、1,3,8-10" };
    const start = Number(match[1]), end = Number(match[2] ?? match[1]);
    if (start < 1 || end < start || end > pageCount) return { pages: [] as number[], error: `页码应在 1 到 ${pageCount} 之间` };
    for (let page = start; page <= end; page += 1) pages.add(page);
  }
  return { pages: [...pages].sort((first, second) => first - second) };
}

function ExportPagesDialog({ pageCount, format, initialPage, exporting, onClose, onExport }: { pageCount: number; format: "pdf" | "image"; initialPage: number; exporting: boolean; onClose: () => void; onExport: (pages: number[]) => void }) {
  const [selectionMode, setSelectionMode] = useState<"all" | "custom">("all");
  const [pageExpression, setPageExpression] = useState(String(initialPage));
  const [error, setError] = useState("");
  const allPages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const parsedPages = parsePageExpression(pageExpression, pageCount);
  const selectedCount = selectionMode === "all" ? pageCount : parsedPages.pages.length;
  function chooseMode(mode: "all" | "custom") { setSelectionMode(mode); setError(""); }
  function updateExpression(value: string) { setPageExpression(value); if (!parsePageExpression(value, pageCount).error) setError(""); }
  function submit() {
    if (selectionMode === "all") { onExport(allPages); return; }
    const result = parsePageExpression(pageExpression, pageCount);
    if (result.error) { setError(result.error); return; }
    if (!result.pages.length) { setError("请至少选择一页"); return; }
    onExport(result.pages);
  }
  const formatName = format === "pdf" ? "PDF" : "图片";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#17223b]/50 p-4" role="dialog" aria-modal="true" aria-labelledby="export-pages-title">
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
      <h2 id="export-pages-title" className="text-xl font-semibold">选择要导出的页面</h2>
      <p className="mt-1 text-sm text-[#667085]">选择导出全部页面，或指定需要的页码范围。</p>
      <fieldset className="mt-5 space-y-3" aria-label="导出页面范围">
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${selectionMode === "all" ? "border-[#315ee7] bg-[#f4f7ff]" : "border-[#e3e8f2] hover:border-[#b9c8f5]"}`}>
          <input type="radio" name="export-page-range" checked={selectionMode === "all"} onChange={() => chooseMode("all")} className="h-4 w-4 accent-[#315ee7]" />
          <span className="text-sm font-semibold text-[#202b42]">全部</span><span className="ml-auto text-sm text-[#667085]">共 {pageCount} 页</span>
        </label>
        <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${selectionMode === "custom" ? "border-[#315ee7] bg-[#f4f7ff]" : "border-[#e3e8f2] hover:border-[#b9c8f5]"}`}>
          <input type="radio" name="export-page-range" checked={selectionMode === "custom"} onChange={() => chooseMode("custom")} className="h-4 w-4 shrink-0 accent-[#315ee7]" />
          <span className="shrink-0 text-sm font-semibold text-[#202b42]">自定义</span>
          <input aria-label="页码范围" disabled={selectionMode !== "custom"} value={pageExpression} onFocus={() => chooseMode("custom")} onChange={(event) => updateExpression(event.target.value)} onBlur={() => { const result = parsePageExpression(pageExpression, pageCount); if (result.error) setError(result.error); }} placeholder="例如 1-5、8、11-13" className="h-10 min-w-0 flex-1 rounded-lg border border-[#d5dce8] bg-white px-3 text-sm outline-none transition placeholder:text-[#98a2b3] focus:border-[#315ee7] focus:ring-2 focus:ring-[#315ee7]/10 disabled:cursor-not-allowed disabled:bg-[#f7f8fa]" />
        </label>
      </fieldset>
      {selectionMode === "custom" && <p className="mt-3 text-xs leading-5 text-[#8a93a5]">用逗号分隔页面，用连字符表示连续范围。</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      <div className="mt-6 flex justify-end gap-2"><button type="button" disabled={exporting} onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-[#f2f4f7]">取消</button><button type="button" disabled={exporting} onClick={submit} className="rounded-lg bg-[#315ee7] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2346bb]">{exporting ? "正在导出…" : `导出 ${selectedCount} 页${formatName}`}</button></div>
    </div>
  </div>;
}

export function EditorShell({ id, initialMode = "edit" }: { id: string; initialMode?: "edit" | "merge" | "split" }) {
  const router = useRouter();
  const imageInput = useRef<HTMLInputElement>(null);
  const documentViewport = useRef<HTMLElement>(null);
  const zoomRef = useRef(1);
  const [doc, setDoc] = useState<LocalDocument | null>(null);
  const [status, setStatus] = useState<"loading" | "dirty" | "saving" | "saved" | "error">("loading");
  const [currentPage, setCurrentPage] = useState("");
  const [splitSelection, setSplitSelection] = useState<Set<string>>(new Set());
  const [signature, setSignature] = useState(false);
  const [exportPagesFormat, setExportPagesFormat] = useState<"pdf" | "image" | null>(null);
  const [mobilePanel, setMobilePanel] = useState<"pages" | "properties" | null>(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const { draft, setDraft, tool, setTool, zoom, setZoom, selectedId, select, commit, updateObject, undo, redo, history, future } = useEditor();

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  useEffect(() => {
    if (window.matchMedia("(max-width: 639px)").matches) setZoom(0.55);
  }, [setZoom]);

  useEffect(() => {
    const viewport = documentViewport.current;
    if (!viewport) return;
    let anchorFrame = 0;

    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      const currentZoom = zoomRef.current;
      const delta = event.deltaY * (event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 16 : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? viewport.clientHeight : 1);
      const nextZoom = Math.max(0.5, Math.min(2, Number((currentZoom * Math.exp(-delta * 0.0025)).toFixed(3))));
      if (nextZoom === currentZoom) return;

      const viewportRect = viewport.getBoundingClientRect();
      const clientX = event.clientX;
      const clientY = event.clientY;
      const offsetX = clientX - viewportRect.left;
      const offsetY = clientY - viewportRect.top;
      const startScrollLeft = viewport.scrollLeft;
      const startScrollTop = viewport.scrollTop;
      const startScrollWidth = viewport.scrollWidth;
      const startScrollHeight = viewport.scrollHeight;
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-pdf-page-id]") : null;
      const targetRect = target?.getBoundingClientRect();
      const pageX = targetRect ? (clientX - targetRect.left) / targetRect.width : 0;
      const pageY = targetRect ? (clientY - targetRect.top) / targetRect.height : 0;

      zoomRef.current = nextZoom;
      setZoom(nextZoom);
      cancelAnimationFrame(anchorFrame);

      let attempts = 0;
      const restoreAnchor = () => {
        attempts += 1;
        const updatedRect = target?.getBoundingClientRect();
        const pageResized = Boolean(updatedRect && targetRect && (Math.abs(updatedRect.width - targetRect.width) > 0.5 || Math.abs(updatedRect.height - targetRect.height) > 0.5));
        const contentResized = Math.abs(viewport.scrollWidth - startScrollWidth) > 0.5 || Math.abs(viewport.scrollHeight - startScrollHeight) > 0.5;
        if (!pageResized && !contentResized && attempts < 40) {
          anchorFrame = requestAnimationFrame(restoreAnchor);
          return;
        }
        if (updatedRect && targetRect) {
          viewport.scrollLeft += updatedRect.left + pageX * updatedRect.width - clientX;
          viewport.scrollTop += updatedRect.top + pageY * updatedRect.height - clientY;
        } else {
          const widthRatio = viewport.scrollWidth / startScrollWidth;
          const heightRatio = viewport.scrollHeight / startScrollHeight;
          viewport.scrollLeft = (startScrollLeft + offsetX) * widthRatio - offsetX;
          viewport.scrollTop = (startScrollTop + offsetY) * heightRatio - offsetY;
        }
      };
      anchorFrame = requestAnimationFrame(restoreAnchor);
    };

    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      viewport.removeEventListener("wheel", onWheel);
      cancelAnimationFrame(anchorFrame);
    };
  }, [doc?.id, setZoom]);

  useEffect(() => {
    void (async () => {
      let loaded = await getDocument(id);
      if (!loaded && process.env.NEXT_PUBLIC_CLOUD_ENABLED === "true") {
        const response = await fetch(`/api/documents/${id}`).catch(() => null);
        if (response?.ok) {
          const remote = await response.json();
          const assets: LocalAsset[] = await Promise.all(remote.assets.filter((asset: { status: string }) => asset.status === "READY").map(async (asset: { id: string; fileName: string; mimeType: string }) => {
            const ticket = await fetch(`/api/documents/${id}/assets/${asset.id}/download-url`); const { downloadUrl } = await ticket.json();
            return { id: asset.id, name: asset.fileName, type: asset.mimeType, data: await (await fetch(downloadUrl)).arrayBuffer() };
          }));
          loaded = { id: remote.id, name: remote.name, assets, draft: remote.draft, version: remote.version, updatedAt: new Date(remote.updatedAt).getTime() };
          await putDocument(loaded);
        }
      }
      if (!loaded) { router.replace("/"); return; }
      setDoc(loaded); setDraft(loaded.draft); setCurrentPage(loaded.draft.pages[0]?.id ?? "");
      if (initialMode === "split") setSplitSelection(new Set(loaded.draft.pages.map((page) => page.id)));
      setStatus("saved");
    })();
  }, [id, initialMode, router, setDraft]);

  useEffect(() => { if (!doc || status === "loading" || draft === doc.draft) return; setStatus("dirty"); const timer = setTimeout(() => void save(), 2000); return () => clearTimeout(timer); }, [draft]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const editing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (!editing && (event.metaKey || event.ctrlKey) && ["+", "="].includes(event.key)) { event.preventDefault(); setZoom(zoom + 0.1); }
      else if (!editing && (event.metaKey || event.ctrlKey) && event.key === "-") { event.preventDefault(); setZoom(zoom - 0.1); }
      else if (!editing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const shortcut = tools.find((item) => item.shortcut?.toLowerCase() === event.key.toLowerCase());
        if (shortcut) { event.preventDefault(); setTool(shortcut.id); }
        else if ((event.key === "Delete" || event.key === "Backspace") && selectedId) { commit((value) => ({ ...value, objects: value.objects.filter((object) => object.id !== selectedId) })); select(null); }
      }
    };
    const before = (event: BeforeUnloadEvent) => { if (status === "dirty" || status === "saving") event.preventDefault(); };
    window.addEventListener("keydown", key); window.addEventListener("beforeunload", before);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("beforeunload", before); };
  }, [commit, redo, select, selectedId, setTool, setZoom, status, undo, zoom]);

  const selected = useMemo(() => draft.objects.find((object) => object.id === selectedId), [draft.objects, selectedId]);
  const page = draft.pages.find((item) => item.id === currentPage) ?? draft.pages[0];
  const activeTool = tools.find((item) => item.id === tool)!;

  async function save() {
    if (!doc) return;
    setStatus("saving");
    try {
      let version = doc.version + 1;
      if (process.env.NEXT_PUBLIC_CLOUD_ENABLED === "true") {
        const remote = await fetch(`/api/documents/${id}/draft`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: doc.version, draft }) }).catch(() => null);
        if (remote?.status === 409) throw new Error("VERSION_CONFLICT");
        if (remote?.ok) version = (await remote.json()).version;
        await fetch(`/api/documents/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: doc.name }) }).catch(() => null);
      }
      const next = { ...doc, draft, version, updatedAt: Date.now() }; await putDocument(next); setDoc(next); setStatus("saved");
    } catch { setStatus("error"); }
  }

  async function uploadCloudAssets(assets: LocalAsset[]) {
    if (process.env.NEXT_PUBLIC_CLOUD_ENABLED !== "true") return assets;
    const uploaded: LocalAsset[] = [];
    for (const asset of assets) {
      const ticket = await fetch(`/api/documents/${id}/assets/upload-url`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: asset.name, mimeType: asset.type, size: asset.data.byteLength }) });
      if (!ticket.ok) throw new Error((await ticket.json()).error ?? "无法创建上传任务");
      const { assetId, uploadUrl } = await ticket.json();
      if (!(await fetch(uploadUrl, { method: "PUT", headers: { "content-type": asset.type }, body: asset.data })).ok) throw new Error("文件上传失败");
      if (!(await fetch(`/api/documents/${id}/assets/${assetId}/complete`, { method: "POST" })).ok) throw new Error("上传校验失败");
      uploaded.push({ ...asset, id: assetId });
    }
    return uploaded;
  }

  async function mergeFiles(files: FileList | null) {
    if (!doc || !files?.length) return;
    setNotice("正在合并文件…");
    try {
      const raw = Array.from(files);
      if (raw.some((file) => file.type !== "application/pdf" || file.size > 20 * 1024 * 1024)) throw new Error("仅支持不超过 20MB 的 PDF");
      let added: LocalAsset[] = await Promise.all(raw.map(async (file) => ({ id: crypto.randomUUID(), name: file.name, type: "application/pdf", data: await file.arrayBuffer() })));
      const checkedPages = await pdfPages(added);
      if (draft.pages.length + checkedPages.length > 100) throw new Error("合并后不能超过 100 页");
      added = await uploadCloudAssets(added);
      const pages = process.env.NEXT_PUBLIC_CLOUD_ENABLED === "true" ? await pdfPages(added) : checkedPages;
      const nextDoc = { ...doc, assets: [...doc.assets, ...added] }; setDoc(nextDoc);
      commit((value) => ({ ...value, pages: [...value.pages, ...pages] }));
      if (initialMode === "split") setSplitSelection((current) => new Set([...current, ...pages.map((item) => item.id)]));
      setCurrentPage(pages[0]?.id ?? currentPage);
      setNotice(`已加入 ${raw.length} 个 PDF、${pages.length} 页；当前共 ${nextDoc.assets.length} 个 PDF、${draft.pages.length + pages.length} 页`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "合并失败"); }
  }

  function addMedia(dataUrl: string, type: "image" | "signature") {
    if (!page) return;
    const object: EditorObject = { id: crypto.randomUUID(), pageId: page.id, type, x: page.width * 0.3, y: page.height * 0.4, width: page.width * 0.4, height: type === "signature" ? 70 : 160, color: "#17223b", opacity: 1, dataUrl };
    commit((value) => ({ ...value, objects: [...value.objects, object] })); select(object.id); setTool("select");
  }

  async function createPdf(pageIds: string[] | undefined, fileName: string) {
    if (!doc) return;
    setExporting(true); setNotice("");
    try { const bytes = await exportPdf(doc.assets, draft, pageIds); downloadBytes(bytes, fileName); setNotice("PDF 已生成并开始下载"); }
    catch (error) { setNotice(error instanceof Error ? `导出失败：${error.message}` : "导出失败"); }
    finally { setExporting(false); }
  }

  function exportSelectedPages(pages: number[]) {
    const pageIds = pages.map((number) => draft.pages[number - 1]?.id).filter((id): id is string => Boolean(id));
    const suffix = pages.join("-");
    const format = exportPagesFormat;
    setExportPagesFormat(null);
    if (format === "image") void exportImages(pageIds, `${doc?.name || "文档"}-${suffix}页`);
    else void createPdf(pageIds, `${doc?.name || "文档"}-${suffix}页.pdf`);
  }

  async function exportSeparatePages() {
    if (!doc || !splitSelection.size) return;
    setExporting(true); setNotice("");
    try {
      const zip = new JSZip();
      const pages = draft.pages.filter((item) => splitSelection.has(item.id));
      for (const item of pages) { const index = draft.pages.indexOf(item) + 1; zip.file(`page-${String(index).padStart(3, "0")}.pdf`, await exportPdf(doc.assets, draft, [item.id])); }
      downloadBytes(await zip.generateAsync({ type: "uint8array" }), `${doc.name}-拆分.zip`, "application/zip"); setNotice(`已拆分 ${pages.length} 页并开始下载`);
    } catch (error) { setNotice(error instanceof Error ? `拆分失败：${error.message}` : "拆分失败"); }
    finally { setExporting(false); }
  }

  async function exportImages(pageIds?: string[], fileBaseName = `${doc?.name || "文档"}-图片`) {
    if (!doc) return;
    setExporting(true); setNotice("");
    try {
      const bytes = await exportPdf(doc.assets, draft, pageIds); const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const rendered = await pdfjs.getDocument({ data: bytes }).promise, zip = new JSZip();
      const images: Blob[] = [];
      for (let index = 1; index <= rendered.numPages; index++) { const source = await rendered.getPage(index), viewport = source.getViewport({ scale: 150 / 72 }), canvas = document.createElement("canvas"); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height); await source.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise; const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片生成失败")), "image/png")); images.push(blob); zip.file(`page-${String(index).padStart(3, "0")}.png`, blob); }
      if (images.length === 1) { downloadBytes(new Uint8Array(await images[0].arrayBuffer()), `${fileBaseName}.png`, "image/png"); setNotice("图片已生成并开始下载"); }
      else { downloadBytes(await zip.generateAsync({ type: "uint8array" }), `${fileBaseName}.zip`, "application/zip"); setNotice(`已生成 ${images.length} 张图片并开始下载`); }
    } catch (error) { setNotice(error instanceof Error ? `导出失败：${error.message}` : "导出失败"); }
    finally { setExporting(false); }
  }

  function reorder(event: DragEndEvent) { if (event.over && event.active.id !== event.over.id) commit((value) => { const from = value.pages.findIndex((item) => item.id === event.active.id), to = value.pages.findIndex((item) => item.id === event.over!.id); return { ...value, pages: arrayMove(value.pages, from, to) }; }); }
  function toggleSplit(id: string) { setSplitSelection((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function selectPattern(pattern: "all" | "odd" | "even" | "none") { setSplitSelection(new Set(draft.pages.filter((_, index) => pattern === "all" || (pattern === "odd" && index % 2 === 0) || (pattern === "even" && index % 2 === 1)).map((item) => item.id))); }

  if (!doc || !page) return <main className="grid min-h-screen place-items-center bg-[#f2f4f7]"><p className="text-[#667085]">正在打开文档…</p></main>;
  return (
    <main className="flex h-[100dvh] min-w-0 flex-col overflow-hidden bg-[#f2f4f7]">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[#dfe3ea] bg-white px-2 sm:h-16 sm:gap-4 sm:px-4">
        <Link href="/documents" className="rounded-lg p-2 hover:bg-[#f2f4f7]"><ArrowLeft size={19} /></Link><span className="hidden sm:block"><Brand /></span><span className="hidden h-6 w-px bg-[#dfe3ea] sm:block" />
        <input aria-label="文档名称" value={doc.name} onChange={(event) => setDoc({ ...doc, name: event.target.value })} onBlur={() => void save()} className="min-w-0 flex-1 rounded px-2 py-1 text-sm font-medium outline-none hover:bg-[#f2f4f7] focus:bg-[#eef2ff] sm:max-w-64 sm:flex-none sm:text-base" />
        <span className="mr-auto hidden text-xs text-[#667085] lg:block">{notice || (status === "saving" ? "保存中…" : status === "dirty" ? "有未保存更改" : status === "error" ? "保存失败" : "已保存")}</span>
        <button onClick={() => void save()} className="rounded-lg p-2 hover:bg-[#f2f4f7]" title="保存"><Save size={18} /></button>
        <div className="flex overflow-hidden rounded-lg bg-[#315ee7] text-white"><button disabled={exporting} aria-label="导出全部 PDF" onClick={() => void createPdf(undefined, `${doc.name || "文档"}.pdf`)} className="flex h-10 items-center gap-2 px-3 text-sm font-semibold hover:bg-[#2346bb] sm:px-4"><Download size={17} /><span className="hidden sm:inline">{exporting ? "处理中…" : initialMode === "merge" ? "导出合并 PDF" : "导出 PDF"}</span></button><button type="button" disabled={exporting} aria-label="选择导出 PDF 页面" onClick={() => setExportPagesFormat("pdf")} className="border-l border-white/25 px-2 hover:bg-[#2346bb]"><ChevronDown size={15} /></button></div>
        <div className="hidden overflow-hidden rounded-lg border border-[#d8deea] bg-white sm:flex"><button disabled={exporting} onClick={() => void exportImages()} className="h-10 px-3 text-sm hover:bg-[#f2f4f7]">导出图片</button><button type="button" disabled={exporting} aria-label="选择导出图片页面" onClick={() => setExportPagesFormat("image")} className="border-l border-[#d8deea] px-2 hover:bg-[#f2f4f7]"><ChevronDown size={15} /></button></div>
      </header>
      <PdfTaskBar mode={initialMode} pageCount={draft.pages.length} assetCount={doc.assets.length} selectedCount={splitSelection.size} exporting={exporting} onSelectAll={() => selectPattern("all")} onSelectOdd={() => selectPattern("odd")} onSelectEven={() => selectPattern("even")} onClear={() => selectPattern("none")} onExportCombined={() => void createPdf(draft.pages.filter((item) => splitSelection.has(item.id)).map((item) => item.id), `${doc.name}-所选页面.pdf`)} onExportSeparate={() => void exportSeparatePages()} />
      <div className="flex h-13 shrink-0 items-center gap-1 overflow-x-auto border-b border-[#dfe3ea] bg-white px-2 shadow-[0_1px_0_rgba(23,34,59,.02)] sm:h-14 sm:gap-2 sm:px-4">
        <button onClick={() => setMobilePanel(mobilePanel === "pages" ? null : "pages")} className="rounded-lg p-2 hover:bg-[#f2f4f7] sm:hidden" aria-label="页面缩略图"><PanelLeft size={18} /></button>
        <div className="flex items-center gap-1">{toolGroups.map((group, groupIndex) => <div key={group[0].id} className="flex items-center gap-1">{groupIndex > 0 && <span className="mx-1 h-6 w-px bg-[#e5e9f0]" />}{group.map((item) => <button key={item.id} type="button" aria-pressed={tool === item.id} title={`${item.label}${item.shortcut ? `（${item.shortcut}）` : ""}`} onClick={() => { if (item.id === "image") imageInput.current?.click(); else if (item.id === "signature") setSignature(true); else setTool(item.id); }} className={`flex h-9 shrink-0 items-center gap-2 rounded-xl px-2.5 text-sm transition-[background-color,color,box-shadow,transform] duration-150 ease-out active:scale-95 sm:px-3 ${tool === item.id ? "bg-[#315ee7] font-semibold text-white shadow-sm" : "text-[#344054] hover:bg-[#f2f4f7] hover:text-[#17223b]"}`}><item.icon size={16} strokeWidth={tool === item.id ? 2.4 : 2} /><span className="hidden md:inline">{item.label}</span></button>)}</div>)}</div>
        <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg" onChange={async (event) => { const file = event.target.files?.[0]; if (file) addMedia(await fileDataUrl(file), "image"); }} />
        <span className="hidden max-w-72 truncate rounded-lg bg-[#f8f9fb] px-2.5 py-1.5 text-xs text-[#667085] 2xl:block"><strong className="font-semibold text-[#344054]">{activeTool.label}</strong> · {activeTool.hint}</span>
        <span className="mx-1 h-6 w-px bg-[#dfe3ea]" /><button aria-label="撤销" disabled={!history.length} onClick={undo} className="rounded-lg p-2 transition-colors hover:bg-[#f2f4f7]" title="撤销（⌘Z）"><Undo2 size={18} /></button><button aria-label="重做" disabled={!future.length} onClick={redo} className="rounded-lg p-2 transition-colors hover:bg-[#f2f4f7]" title="重做（⇧⌘Z）"><Redo2 size={18} /></button>
        <div className="ml-auto flex items-center gap-1 rounded-xl border border-[#e5e9f0] bg-[#f8f9fb] p-0.5"><button aria-label="缩小 PDF" onClick={() => setZoom(zoom - 0.1)} className="rounded-lg p-1.5 transition-colors hover:bg-white hover:shadow-sm"><ZoomOut size={17} /></button><span className="hidden w-14 text-center text-xs font-medium tabular-nums sm:block" title="可在文档区域使用触控板双指缩放">{Math.round(zoom * 100)}%</span><button aria-label="放大 PDF" onClick={() => setZoom(zoom + 0.1)} className="rounded-lg p-1.5 transition-colors hover:bg-white hover:shadow-sm"><ZoomIn size={17} /></button><button onClick={() => setMobilePanel(mobilePanel === "properties" ? null : "properties")} className="rounded-lg p-1.5 transition-colors hover:bg-white sm:hidden" aria-label="页面与对象属性"><SlidersHorizontal size={17} /></button></div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className={`${mobilePanel === "pages" ? "fixed inset-x-0 bottom-0 top-[108px] z-40 block bg-[#f8f9fb] shadow-2xl" : "hidden"} sm:static sm:block sm:w-48 sm:shrink-0`}><PageSidebar pages={draft.pages} assets={doc.assets} activeId={page.id} splitMode={initialMode === "split"} selectedIds={splitSelection} onToggle={toggleSplit} onReorder={reorder} onAddFiles={(files) => void mergeFiles(files)} onSelect={(pageId) => { setCurrentPage(pageId); setMobilePanel(null); document.getElementById(`page-${pageId}`)?.scrollIntoView({ behavior: "smooth" }); }} /></div>
        <section ref={documentViewport} aria-label="PDF 文档区域，可使用触控板双指缩放" className="min-w-0 flex-1 overflow-auto px-3 py-5 sm:px-8 sm:py-10 [overscroll-behavior:contain]"><div className="mx-auto flex w-fit flex-col gap-6 sm:gap-10">{draft.pages.map((item, index) => <LazyPage key={item.id} page={item} assets={doc.assets} onVisible={setCurrentPage} priority={index === 0} />)}</div></section>
        <aside className={`${mobilePanel === "properties" ? "fixed inset-x-0 bottom-0 top-[108px] z-40 block shadow-2xl" : "hidden"} w-full overflow-y-auto border-l border-[#dfe3ea] bg-white p-5 sm:static sm:block sm:w-64 sm:shrink-0`}>
          {selected ? <ObjectProperties object={selected} onChange={(changes) => updateObject(selected.id, changes)} onDelete={() => { commit((value) => ({ ...value, objects: value.objects.filter((object) => object.id !== selected.id) })); select(null); }} /> : <><h2 className="font-semibold">页面</h2><div className="mt-6 space-y-3"><p className="text-sm text-[#667085]">第 {draft.pages.findIndex((item) => item.id === page.id) + 1} 页，共 {draft.pages.length} 页</p><button onClick={() => commit((value) => ({ ...value, pages: value.pages.map((item) => item.id === page.id ? { ...item, rotation: ((item.rotation + 90) % 360) as DraftPage["rotation"] } : item) }))} className="flex w-full items-center gap-2 rounded-lg border border-[#d8deea] px-3 py-2 text-sm hover:bg-[#f2f4f7]"><RotateCw size={16} />顺时针旋转</button><button disabled={draft.pages.length === 1} onClick={() => { commit((value) => ({ ...value, pages: value.pages.filter((item) => item.id !== page.id), objects: value.objects.filter((object) => object.pageId !== page.id) })); setSplitSelection((value) => { const next = new Set(value); next.delete(page.id); return next; }); setCurrentPage(draft.pages.find((item) => item.id !== page.id)?.id ?? ""); }} className="flex w-full items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16} />删除这一页</button><p className="pt-3 text-xs leading-5 text-[#8a93a5]">拖动左侧缩略图调整页序。拆分模式可直接勾选需要的页面。</p></div></>}
        </aside>
      </div>
      {signature && <SignatureDialog onClose={() => setSignature(false)} onDone={(data) => { addMedia(data, "signature"); setSignature(false); }} />}
      {exportPagesFormat && <ExportPagesDialog pageCount={draft.pages.length} format={exportPagesFormat} initialPage={Math.max(1, draft.pages.findIndex((item) => item.id === page.id) + 1)} exporting={exporting} onClose={() => setExportPagesFormat(null)} onExport={exportSelectedPages} />}
    </main>
  );
}
