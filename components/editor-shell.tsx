"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { arrayMove } from "@dnd-kit/sortable";
import type { DragEndEvent } from "@dnd-kit/core";
import JSZip from "jszip";
import {
  ArrowLeft, ChevronDown, Download, Highlighter, Image as ImageIcon, Minus,
  MousePointer2, PenLine, Redo2, RotateCw, Save, Square, Trash2, Type, Undo2,
  ZoomIn, ZoomOut,
} from "lucide-react";
import { Brand } from "./brand";
import { PageCanvas } from "./page-canvas";
import { PageSidebar } from "./page-sidebar";
import { PdfTaskBar } from "./pdf-task-bar";
import { useEditor } from "@/lib/editor-store";
import type { DraftPage, EditorObject, Tool } from "@/lib/editor-types";
import { downloadBytes, exportPdf, fileDataUrl, pdfPages } from "@/lib/pdf-engine";
import { getDocument, putDocument, type LocalAsset, type LocalDocument } from "@/lib/local-db";

const tools: { id: Tool; label: string; icon: React.ElementType }[] = [
  { id: "select", label: "选择", icon: MousePointer2 }, { id: "text", label: "文字", icon: Type },
  { id: "image", label: "图片", icon: ImageIcon }, { id: "rect", label: "矩形", icon: Square },
  { id: "highlight", label: "高亮", icon: Highlighter }, { id: "line", label: "线条", icon: Minus },
  { id: "signature", label: "签名", icon: PenLine },
];

function LazyPage({ page, assets, onVisible }: { page: DraftPage; assets: LocalAsset[]; onVisible: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const zoom = useEditor((state) => state.zoom);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setVisible(true); }, { rootMargin: "500px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
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
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState("");
  const { draft, setDraft, tool, setTool, zoom, setZoom, selectedId, select, commit, updateObject, undo, redo, history, future } = useEditor();

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

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
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if ((event.key === "Delete" || event.key === "Backspace") && selectedId && (event.target as HTMLElement).tagName !== "INPUT") { commit((value) => ({ ...value, objects: value.objects.filter((object) => object.id !== selectedId) })); select(null); }
    };
    const before = (event: BeforeUnloadEvent) => { if (status === "dirty" || status === "saving") event.preventDefault(); };
    window.addEventListener("keydown", key); window.addEventListener("beforeunload", before);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("beforeunload", before); };
  }, [commit, redo, select, selectedId, status, undo]);

  const selected = useMemo(() => draft.objects.find((object) => object.id === selectedId), [draft.objects, selectedId]);
  const page = draft.pages.find((item) => item.id === currentPage) ?? draft.pages[0];

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
      setNotice(`已加入 ${raw.length} 个 PDF、${pages.length} 页`);
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

  async function exportImages() {
    if (!doc) return;
    setExporting(true);
    try {
      const bytes = await exportPdf(doc.assets, draft); const pdfjs = await import("pdfjs-dist"); pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      const rendered = await pdfjs.getDocument({ data: bytes }).promise, zip = new JSZip();
      for (let index = 1; index <= rendered.numPages; index++) { const source = await rendered.getPage(index), viewport = source.getViewport({ scale: 150 / 72 }), canvas = document.createElement("canvas"); canvas.width = Math.round(viewport.width); canvas.height = Math.round(viewport.height); await source.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise; const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片生成失败")), "image/png")); zip.file(`page-${String(index).padStart(3, "0")}.png`, blob); }
      downloadBytes(await zip.generateAsync({ type: "uint8array" }), `${doc.name}-图片.zip`, "application/zip"); setNotice("图片 ZIP 已生成并开始下载");
    } finally { setExporting(false); }
  }

  function reorder(event: DragEndEvent) { if (event.over && event.active.id !== event.over.id) commit((value) => { const from = value.pages.findIndex((item) => item.id === event.active.id), to = value.pages.findIndex((item) => item.id === event.over!.id); return { ...value, pages: arrayMove(value.pages, from, to) }; }); }
  function toggleSplit(id: string) { setSplitSelection((current) => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; }); }
  function selectPattern(pattern: "all" | "odd" | "even" | "none") { setSplitSelection(new Set(draft.pages.filter((_, index) => pattern === "all" || (pattern === "odd" && index % 2 === 0) || (pattern === "even" && index % 2 === 1)).map((item) => item.id))); }

  if (!doc || !page) return <main className="grid min-h-screen place-items-center bg-[#f2f4f7]"><p className="text-[#667085]">正在打开文档…</p></main>;
  return (
    <main className="flex h-screen min-w-[900px] flex-col overflow-hidden bg-[#f2f4f7]">
      <header className="flex h-16 shrink-0 items-center gap-4 border-b border-[#dfe3ea] bg-white px-4">
        <Link href="/documents" className="rounded-lg p-2 hover:bg-[#f2f4f7]"><ArrowLeft size={19} /></Link><Brand /><span className="h-6 w-px bg-[#dfe3ea]" />
        <input value={doc.name} onChange={(event) => setDoc({ ...doc, name: event.target.value })} onBlur={() => void save()} className="min-w-0 max-w-64 rounded px-2 py-1 font-medium outline-none hover:bg-[#f2f4f7] focus:bg-[#eef2ff]" />
        <span className="mr-auto text-xs text-[#667085]">{notice || (status === "saving" ? "保存中…" : status === "dirty" ? "有未保存更改" : status === "error" ? "保存失败" : "已保存")}</span>
        <button onClick={() => void save()} className="rounded-lg p-2 hover:bg-[#f2f4f7]" title="保存"><Save size={18} /></button>
        <button disabled={exporting} onClick={() => void createPdf(undefined, `${doc.name || "文档"}.pdf`)} className="flex h-10 items-center gap-2 rounded-lg bg-[#315ee7] px-4 text-sm font-semibold text-white hover:bg-[#2346bb]"><Download size={17} />{exporting ? "处理中…" : initialMode === "merge" ? "导出合并 PDF" : "导出 PDF"}<ChevronDown size={15} /></button>
        <button disabled={exporting} onClick={() => void exportImages()} className="h-10 rounded-lg border border-[#d8deea] px-3 text-sm">导出图片</button>
      </header>
      <PdfTaskBar mode={initialMode} pageCount={draft.pages.length} assetCount={doc.assets.length} selectedCount={splitSelection.size} exporting={exporting} onSelectAll={() => selectPattern("all")} onSelectOdd={() => selectPattern("odd")} onSelectEven={() => selectPattern("even")} onClear={() => selectPattern("none")} onExportCombined={() => void createPdf(draft.pages.filter((item) => splitSelection.has(item.id)).map((item) => item.id), `${doc.name}-所选页面.pdf`)} onExportSeparate={() => void exportSeparatePages()} />
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-[#dfe3ea] bg-white px-4">
        <div className="flex gap-1">{tools.map((item) => <button key={item.id} onClick={() => { if (item.id === "image") imageInput.current?.click(); else if (item.id === "signature") setSignature(true); else setTool(item.id); }} className={`flex h-10 items-center gap-2 rounded-lg px-3 text-sm ${tool === item.id ? "bg-[#eef2ff] font-medium text-[#315ee7]" : "hover:bg-[#f2f4f7]"}`}><item.icon size={17} />{item.label}</button>)}</div>
        <input ref={imageInput} hidden type="file" accept="image/png,image/jpeg" onChange={async (event) => { const file = event.target.files?.[0]; if (file) addMedia(await fileDataUrl(file), "image"); }} />
        <span className="mx-2 h-6 w-px bg-[#dfe3ea]" /><button disabled={!history.length} onClick={undo} className="rounded-lg p-2 hover:bg-[#f2f4f7]" title="撤销"><Undo2 size={18} /></button><button disabled={!future.length} onClick={redo} className="rounded-lg p-2 hover:bg-[#f2f4f7]" title="重做"><Redo2 size={18} /></button>
        <div className="ml-auto flex items-center gap-1"><button aria-label="缩小 PDF" onClick={() => setZoom(zoom - 0.1)} className="rounded-lg p-2 hover:bg-[#f2f4f7]"><ZoomOut size={18} /></button><span className="w-14 text-center text-xs" title="可在文档区域使用触控板双指缩放">{Math.round(zoom * 100)}%</span><button aria-label="放大 PDF" onClick={() => setZoom(zoom + 0.1)} className="rounded-lg p-2 hover:bg-[#f2f4f7]"><ZoomIn size={18} /></button></div>
      </div>
      <div className="flex min-h-0 flex-1">
        <PageSidebar pages={draft.pages} assets={doc.assets} activeId={page.id} splitMode={initialMode === "split"} selectedIds={splitSelection} onToggle={toggleSplit} onReorder={reorder} onAddFiles={(files) => void mergeFiles(files)} onSelect={(pageId) => { setCurrentPage(pageId); document.getElementById(`page-${pageId}`)?.scrollIntoView({ behavior: "smooth" }); }} />
        <section ref={documentViewport} aria-label="PDF 文档区域，可使用触控板双指缩放" className="min-w-0 flex-1 overflow-auto px-8 py-10 [overscroll-behavior:contain]"><div className="mx-auto flex w-fit flex-col gap-10">{draft.pages.map((item) => <LazyPage key={item.id} page={item} assets={doc.assets} onVisible={setCurrentPage} />)}</div></section>
        <aside className="w-64 shrink-0 overflow-y-auto border-l border-[#dfe3ea] bg-white p-5">
          <h2 className="font-semibold">{selected ? "对象属性" : "页面"}</h2>
          {selected ? <div className="mt-6 space-y-5"><label className="block text-xs text-[#667085]">颜色<input type="color" value={selected.color} onChange={(event) => updateObject(selected.id, { color: event.target.value })} className="mt-2 h-10 w-full" /></label>{selected.type === "text" && <><label className="block text-xs text-[#667085]">文字<input value={selected.text} onChange={(event) => updateObject(selected.id, { text: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-[#d8deea] px-3 text-sm" /></label><label className="block text-xs text-[#667085]">字号<input type="number" min="6" max="200" value={selected.fontSize} onChange={(event) => updateObject(selected.id, { fontSize: Number(event.target.value) })} className="mt-2 h-10 w-full rounded-lg border border-[#d8deea] px-3 text-sm" /></label></>}{(selected.type === "image" || selected.type === "signature") && <label className="block text-xs text-[#667085]">宽度<input type="number" min="20" value={Math.round(selected.width)} onChange={(event) => { const width = Number(event.target.value); updateObject(selected.id, { width, height: selected.height * width / selected.width }); }} className="mt-2 h-10 w-full rounded-lg border border-[#d8deea] px-3 text-sm" /></label>}<label className="block text-xs text-[#667085]">透明度<input type="range" min="0.1" max="1" step="0.05" value={selected.opacity} onChange={(event) => updateObject(selected.id, { opacity: Number(event.target.value) })} className="mt-2 w-full" /></label><button onClick={() => { commit((value) => ({ ...value, objects: value.objects.filter((object) => object.id !== selected.id) })); select(null); }} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-200 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16} />删除对象</button></div> : <div className="mt-6 space-y-3"><p className="text-sm text-[#667085]">第 {draft.pages.findIndex((item) => item.id === page.id) + 1} 页，共 {draft.pages.length} 页</p><button onClick={() => commit((value) => ({ ...value, pages: value.pages.map((item) => item.id === page.id ? { ...item, rotation: ((item.rotation + 90) % 360) as DraftPage["rotation"] } : item) }))} className="flex w-full items-center gap-2 rounded-lg border border-[#d8deea] px-3 py-2 text-sm hover:bg-[#f2f4f7]"><RotateCw size={16} />顺时针旋转</button><button disabled={draft.pages.length === 1} onClick={() => { commit((value) => ({ ...value, pages: value.pages.filter((item) => item.id !== page.id), objects: value.objects.filter((object) => object.pageId !== page.id) })); setSplitSelection((value) => { const next = new Set(value); next.delete(page.id); return next; }); setCurrentPage(draft.pages.find((item) => item.id !== page.id)?.id ?? ""); }} className="flex w-full items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm text-red-600 hover:bg-red-50"><Trash2 size={16} />删除这一页</button><p className="pt-3 text-xs leading-5 text-[#8a93a5]">拖动左侧缩略图调整页序。拆分模式可直接勾选需要的页面。</p></div>}
        </aside>
      </div>
      {signature && <SignatureDialog onClose={() => setSignature(false)} onDone={(data) => { addMedia(data, "signature"); setSignature(false); }} />}
    </main>
  );
}
