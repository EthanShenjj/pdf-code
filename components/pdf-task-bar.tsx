"use client";

import { FileArchive, FileDown, Files, LoaderCircle, Scissors } from "lucide-react";

export function PdfTaskBar({ mode, pageCount, assetCount, selectedCount, exporting, onSelectAll, onSelectOdd, onSelectEven, onClear, onExportCombined, onExportSeparate }: {
  mode: "edit" | "merge" | "split";
  pageCount: number;
  assetCount: number;
  selectedCount: number;
  exporting: boolean;
  onSelectAll: () => void;
  onSelectOdd: () => void;
  onSelectEven: () => void;
  onClear: () => void;
  onExportCombined: () => void;
  onExportSeparate: () => void;
}) {
  if (mode === "edit") return null;
  if (mode === "merge") return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[#ccd7fb] bg-[#eef2ff] px-5 text-sm">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[#315ee7]"><Files size={17} /></span>
      <strong>合并模式</strong>
      <span className="text-[#5d6c86]">已加入 {assetCount} 个文件，共 {pageCount} 页。拖动左侧页面调整最终顺序。</span>
    </div>
  );
  return (
    <div className="flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-[#f1d6a7] bg-[#fff8ea] px-5 py-2 text-sm">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white text-[#b36b00]"><Scissors size={17} /></span>
      <strong>拆分模式</strong>
      <span className="mr-2 text-[#765d34]">已选择 {selectedCount}/{pageCount} 页</span>
      <button type="button" onClick={onSelectAll} className="rounded-lg bg-white px-3 py-2 hover:bg-[#fffdf8]">全选</button>
      <button type="button" onClick={onSelectOdd} className="rounded-lg bg-white px-3 py-2 hover:bg-[#fffdf8]">奇数页</button>
      <button type="button" onClick={onSelectEven} className="rounded-lg bg-white px-3 py-2 hover:bg-[#fffdf8]">偶数页</button>
      <button type="button" onClick={onClear} className="rounded-lg px-3 py-2 text-[#765d34] hover:bg-white">清空</button>
      <span className="flex-1" />
      <button type="button" disabled={!selectedCount || exporting} onClick={onExportSeparate} className="flex items-center gap-2 rounded-lg border border-[#e6c88f] bg-white px-3 py-2 font-medium text-[#76500e]">
        <FileArchive size={16} />逐页 ZIP
      </button>
      <button type="button" disabled={!selectedCount || exporting} onClick={onExportCombined} className="flex items-center gap-2 rounded-lg bg-[#315ee7] px-4 py-2 font-semibold text-white">
        {exporting ? <LoaderCircle size={16} className="animate-spin" /> : <FileDown size={16} />}导出所选 PDF
      </button>
    </div>
  );
}
