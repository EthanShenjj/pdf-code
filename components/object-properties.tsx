"use client";

import { Check, Copy, Palette, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { EditorObject } from "@/lib/editor-types";

const objectNames: Record<EditorObject["type"], string> = {
  text: "文字",
  image: "图片",
  rect: "矩形",
  highlight: "文字高亮",
  line: "线条",
  signature: "签名",
};

const standardColors = ["#17223b", "#315ee7", "#7c5ce7", "#e75f76", "#e59a2f", "#38a169"];
const highlightColors = ["#f6c945", "#75c88a", "#f28aa9", "#7aa7ff"];

export function ObjectProperties({ object, onChange, onDelete }: {
  object: EditorObject;
  onChange: (changes: Partial<EditorObject>) => void;
  onDelete: () => void;
}) {
  const hasColor = object.type !== "image" && object.type !== "signature";
  const colors = object.type === "highlight" ? highlightColors : standardColors;
  const [customColorOpen, setCustomColorOpen] = useState(false);
  const [hexValue, setHexValue] = useState(object.color.toUpperCase());
  const [copied, setCopied] = useState(false);

  useEffect(() => { setHexValue(object.color.toUpperCase()); }, [object.id, object.color]);

  function updateHex(value: string) {
    const normalized = value.startsWith("#") ? value : `#${value}`;
    setHexValue(normalized.toUpperCase());
    if (/^#[0-9A-F]{6}$/i.test(normalized)) onChange({ color: normalized });
  }

  async function copyHex() {
    try {
      await navigator.clipboard.writeText(object.color.toUpperCase());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch { /* Clipboard access is optional. */ }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-[-.01em]">对象属性</h2>
          <p className="mt-1 text-xs text-[#8a93a5]">{objectNames[object.type]}</p>
        </div>
        <span className="rounded-full bg-[#eef2ff] px-2.5 py-1 text-[11px] font-medium text-[#315ee7]">已选中</span>
      </div>

      <div className="mt-5 space-y-3">
        {object.type === "text" && <section className="rounded-xl border border-[#e7eaf0] bg-[#fafbfc] p-3">
          <label className="block text-xs font-medium text-[#5f6b7c]">文字内容
            <input value={object.text} onChange={(event) => onChange({ text: event.target.value })} className="mt-2 h-10 w-full rounded-lg border border-[#dfe3ea] bg-white px-3 text-sm text-[#17223b] outline-none transition focus:border-[#7b9af2] focus:ring-2 focus:ring-[#315ee7]/10" />
          </label>
          <label className="mt-3 block text-xs font-medium text-[#5f6b7c]">字号
            <div className="relative mt-2"><input aria-label="字号" type="number" min="6" max="200" value={object.fontSize} onChange={(event) => onChange({ fontSize: Number(event.target.value) })} className="h-10 w-full rounded-lg border border-[#dfe3ea] bg-white px-3 pr-9 text-sm tabular-nums outline-none transition focus:border-[#7b9af2] focus:ring-2 focus:ring-[#315ee7]/10" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#98a2b3]">pt</span></div>
          </label>
        </section>}

        {(object.type === "image" || object.type === "signature") && <section className="rounded-xl border border-[#e7eaf0] bg-[#fafbfc] p-3">
          <label className="block text-xs font-medium text-[#5f6b7c]">宽度
            <div className="relative mt-2"><input aria-label="宽度" type="number" min="20" value={Math.round(object.width)} onChange={(event) => { const width = Number(event.target.value); onChange({ width, height: object.height * width / object.width }); }} className="h-10 w-full rounded-lg border border-[#dfe3ea] bg-white px-3 pr-9 text-sm tabular-nums outline-none transition focus:border-[#7b9af2] focus:ring-2 focus:ring-[#315ee7]/10" /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#98a2b3]">pt</span></div>
          </label>
        </section>}

        {hasColor && <section className="rounded-xl border border-[#e7eaf0] bg-[#fafbfc] p-3">
          <div className="flex items-center justify-between"><span className="text-xs font-medium text-[#5f6b7c]">颜色</span><span className="text-[11px] font-medium tabular-nums text-[#98a2b3]">{object.color.toUpperCase()}</span></div>
          <div className="mt-3 flex items-center gap-2">
            {colors.map((color) => <button key={color} type="button" aria-label={`设置颜色 ${color}`} aria-pressed={object.color.toLowerCase() === color} onClick={() => onChange({ color })} className={`h-7 w-7 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(23,34,59,.12)] transition hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ee7] ${object.color.toLowerCase() === color ? "ring-2 ring-[#315ee7] ring-offset-1" : ""}`} style={{ backgroundColor: color }} />)}
            <button type="button" aria-label="自定义颜色" aria-expanded={customColorOpen} onClick={() => setCustomColorOpen((value) => !value)} className={`ml-auto flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ee7] ${customColorOpen ? "border-[#315ee7] bg-[#eef2ff] text-[#2346bb]" : "border-[#d8deea] bg-white text-[#5f6b7c] hover:border-[#7b9af2] hover:text-[#315ee7]"}`}><Palette size={13} />自定义</button>
          </div>
          {customColorOpen && <div className="mt-3 rounded-xl border border-[#dce4f8] bg-white p-3 shadow-[0_8px_18px_rgba(49,94,231,.08)]">
            <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#344054]">自定义颜色</span><button type="button" aria-label="收起自定义颜色" onClick={() => setCustomColorOpen(false)} className="rounded-md p-1 text-[#667085] hover:bg-[#f2f4f7] hover:text-[#17223b]"><X size={14} /></button></div>
            <div className="mt-3 flex items-center gap-3"><span aria-hidden="true" className="h-10 w-10 shrink-0 rounded-xl border-2 border-white shadow-[0_0_0_1px_rgba(23,34,59,.16)]" style={{ backgroundColor: object.color }} /><div className="min-w-0 flex-1"><label htmlFor={`hex-${object.id}`} className="block text-[11px] font-medium text-[#667085]">Hex 色值</label><div className="mt-1 flex h-9 overflow-hidden rounded-lg border border-[#cfd7e6] bg-white focus-within:border-[#315ee7] focus-within:ring-2 focus-within:ring-[#315ee7]/10"><input id={`hex-${object.id}`} aria-label="Hex 色值" value={hexValue} onChange={(event) => updateHex(event.target.value)} maxLength={7} spellCheck={false} className="min-w-0 flex-1 bg-transparent px-2.5 text-sm font-medium uppercase tracking-[.04em] text-[#17223b] outline-none" /><button type="button" aria-label="复制颜色值" onClick={() => void copyHex()} className="grid w-9 place-items-center border-l border-[#e5e9f0] text-[#667085] transition hover:bg-[#f6f8fc] hover:text-[#315ee7]">{copied ? <Check size={15} /> : <Copy size={14} />}</button></div></div></div>
            <p className="mt-2 text-[11px] leading-4 text-[#8a93a5]">输入 6 位 Hex 色值，例如 #315EE7。</p>
          </div>}
        </section>}

        <section className="rounded-xl border border-[#e7eaf0] bg-[#fafbfc] p-3">
          <div className="flex items-center justify-between"><label htmlFor={`opacity-${object.id}`} className="text-xs font-medium text-[#5f6b7c]">透明度</label><span className="rounded-md bg-white px-2 py-0.5 text-xs font-semibold tabular-nums text-[#344054] shadow-sm">{Math.round(object.opacity * 100)}%</span></div>
          <input id={`opacity-${object.id}`} aria-label="透明度" type="range" min="0.1" max="1" step="0.05" value={object.opacity} onChange={(event) => onChange({ opacity: Number(event.target.value) })} className="property-range mt-4 w-full" style={{ "--range-progress": `${object.opacity * 100}%` } as React.CSSProperties} />
        </section>
      </div>

      <button type="button" onClick={onDelete} className="mt-5 flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-transparent text-sm font-medium text-[#d92d20] transition hover:border-[#fecaca] hover:bg-[#fff5f5] active:scale-[.98]"><Trash2 size={15} />删除对象</button>
    </div>
  );
}
