"use client";

import { Eye, Palette } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Rgb = { red: number; green: number; blue: number };
type Hsv = { hue: number; saturation: number; value: number };

type Props = {
  value: string;
  onChange: (color: string) => void;
  ariaLabel: string;
  compact?: boolean;
  confirmLabel?: string;
};

const hueTrack = "linear-gradient(90deg,#ef4444,#f59e0b,#facc15,#22c55e,#06b6d4,#3b82f6,#8b5cf6,#ec4899,#ef4444)";

function normalizeHex(value: string) {
  const hex = value.trim().replace(/^#/, "");
  return /^[\da-f]{6}$/i.test(hex) ? `#${hex.toUpperCase()}` : null;
}

function hexToRgb(value: string): Rgb {
  const hex = normalizeHex(value) ?? "#315EE7";
  return { red: Number.parseInt(hex.slice(1, 3), 16), green: Number.parseInt(hex.slice(3, 5), 16), blue: Number.parseInt(hex.slice(5, 7), 16) };
}

function rgbToHex({ red, green, blue }: Rgb) {
  return `#${[red, green, blue].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function rgbToHsv({ red, green, blue }: Rgb): Hsv {
  const r = red / 255, g = green / 255, b = blue / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), difference = max - min;
  let hue = 0;
  if (difference) {
    if (max === r) hue = 60 * (((g - b) / difference) % 6);
    else if (max === g) hue = 60 * ((b - r) / difference + 2);
    else hue = 60 * ((r - g) / difference + 4);
  }
  return { hue: (hue + 360) % 360, saturation: max ? difference / max : 0, value: max };
}

function hsvToHex({ hue, saturation, value }: Hsv) {
  const chroma = value * saturation;
  const second = chroma * (1 - Math.abs((hue / 60) % 2 - 1));
  const match = value - chroma;
  const [r, g, b] = hue < 60 ? [chroma, second, 0] : hue < 120 ? [second, chroma, 0] : hue < 180 ? [0, chroma, second] : hue < 240 ? [0, second, chroma] : hue < 300 ? [second, 0, chroma] : [chroma, 0, second];
  return rgbToHex({ red: (r + match) * 255, green: (g + match) * 255, blue: (b + match) * 255 });
}

export function ColorPicker({ value, onChange, ariaLabel, compact = false, confirmLabel }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const spectrum = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(normalizeHex(value) ?? "#315EE7");
  const [hexInput, setHexInput] = useState((normalizeHex(value) ?? "#315EE7").toUpperCase());
  const [hue, setHue] = useState(rgbToHsv(hexToRgb(value)).hue);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const deferred = Boolean(confirmLabel);
  const rgb = hexToRgb(draft);
  const hsv = rgbToHsv(rgb);

  useEffect(() => {
    const color = normalizeHex(value) ?? "#315EE7";
    setDraft(color);
    setHexInput(color);
    const nextHue = rgbToHsv(hexToRgb(color));
    if (nextHue.saturation) setHue(nextHue.hue);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const placePanel = () => {
      const bounds = trigger.current?.getBoundingClientRect();
      if (!bounds) return;
      const width = 256, height = confirmLabel ? 310 : 270;
      const opensDown = window.innerHeight - bounds.bottom > height + 24;
      setPosition({ top: opensDown ? bounds.bottom + 8 : Math.max(8, bounds.top - height - 8), left: Math.max(8, Math.min(window.innerWidth - width - 8, bounds.right - width)) });
    };
    placePanel();
    const closeWhenOutside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node) && !panel.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", closeWhenOutside);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", placePanel);
    window.addEventListener("scroll", placePanel, true);
    return () => { document.removeEventListener("pointerdown", closeWhenOutside); document.removeEventListener("keydown", closeOnEscape); window.removeEventListener("resize", placePanel); window.removeEventListener("scroll", placePanel, true); };
  }, [confirmLabel, open]);

  function setColor(color: string) {
    const normalized = normalizeHex(color);
    if (!normalized) return;
    setDraft(normalized);
    setHexInput(normalized);
    const nextHsv = rgbToHsv(hexToRgb(normalized));
    if (nextHsv.saturation) setHue(nextHsv.hue);
    if (!deferred) onChange(normalized);
  }

  function setRgb(channel: keyof Rgb, raw: string) {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    setColor(rgbToHex({ ...rgb, [channel]: Math.max(0, Math.min(255, next)) }));
  }

  function setSpectrum(event: React.PointerEvent<HTMLDivElement>) {
    const element = spectrum.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const saturation = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const value = Math.max(0, Math.min(1, 1 - (event.clientY - bounds.top) / bounds.height));
    setColor(hsvToHex({ hue, saturation, value }));
  }

  async function pickFromScreen() {
    const EyeDropper = (window as unknown as { EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> } }).EyeDropper;
    if (!EyeDropper) return;
    try { setColor((await new EyeDropper().open()).sRGBHex); } catch { /* Picking was cancelled. */ }
  }

  function openPicker() {
    const color = normalizeHex(value) ?? "#315EE7";
    setDraft(color);
    setHexInput(color);
    const nextHsv = rgbToHsv(hexToRgb(color));
    if (nextHsv.saturation) setHue(nextHsv.hue);
    setOpen(true);
  }

  const hasEyeDropper = typeof window !== "undefined" && "EyeDropper" in window;
  const triggerClass = compact ? "h-6 w-6 text-sm" : "h-7 gap-1 px-2 text-xs font-medium";

  return <div ref={root} className="relative">
    <button ref={trigger} type="button" aria-label={ariaLabel} aria-expanded={open} onClick={() => open ? setOpen(false) : openPicker()} className={`flex items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#315ee7] ${open ? "border-[#315ee7] bg-[#eef2ff] text-[#2346bb]" : "border-[#d8deea] bg-white text-[#5f6b7c] hover:border-[#7b9af2] hover:text-[#315ee7]"} ${triggerClass}`}>{compact ? "+" : <><Palette size={13} />自定义</>}</button>
    {open && typeof document !== "undefined" && createPortal(<div ref={panel} role="dialog" aria-label={`${ariaLabel}面板`} onPointerDown={(event) => event.stopPropagation()} className="fixed z-[100] w-64 rounded-2xl border border-[#dce4f8] bg-white p-3 shadow-[0_16px_36px_rgba(23,34,59,.22)]" style={position}>
      <div className="flex items-center justify-between"><span className="text-xs font-semibold text-[#344054]">自定义颜色</span><span className="rounded-md bg-[#f2f4f7] px-2 py-0.5 text-[11px] font-medium text-[#667085]">{draft}</span></div>
      <div ref={spectrum} role="slider" aria-label="颜色明度与饱和度" tabIndex={0} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setSpectrum(event); }} onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) setSpectrum(event); }} className="relative mt-3 h-28 cursor-crosshair overflow-hidden rounded-xl border border-black/10" style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), hsl(${hue} 100% 50%)` }}><span className="pointer-events-none absolute h-3.5 w-3.5 rounded-full border-2 border-white shadow-[0_1px_3px_rgba(0,0,0,.42)]" style={{ left: `${hsv.saturation * 100}%`, top: `${(1 - hsv.value) * 100}%`, transform: "translate(-50%, -50%)" }} /></div>
      <div className="mt-3 flex items-center gap-2"><input aria-label="色相" type="range" min="0" max="360" value={hue} onChange={(event) => { const nextHue = Number(event.target.value); setHue(nextHue); setColor(hsvToHex({ hue: nextHue, saturation: hsv.saturation || 1, value: hsv.value || 1 })); }} className="color-hue-range h-4 flex-1" style={{ background: hueTrack }} />{hasEyeDropper && <button type="button" aria-label="从屏幕取色" onClick={() => void pickFromScreen()} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[#d8deea] text-[#667085] transition hover:border-[#7b9af2] hover:bg-[#eef2ff] hover:text-[#315ee7]"><Eye size={15} /></button>}</div>
      <div className="mt-3 grid grid-cols-[1fr_34px_34px_34px] gap-1.5"><label className="text-[11px] font-medium text-[#667085]">Hex<input aria-label="Hex 色值" value={hexInput} onChange={(event) => { const next = event.target.value.toUpperCase(); setHexInput(next); const normalized = normalizeHex(next); if (normalized) setColor(normalized); }} onBlur={() => setHexInput(draft)} maxLength={7} spellCheck={false} className="mt-1 h-8 w-full rounded-lg border border-[#d8deea] bg-white px-2 text-xs font-semibold tracking-[.04em] text-[#17223b] outline-none focus:border-[#7b9af2] focus:ring-2 focus:ring-[#315ee7]/10" /></label>{([{ key: "red", label: "R" }, { key: "green", label: "G" }, { key: "blue", label: "B" }] as const).map(({ key, label }) => <label key={key} className="text-center text-[11px] font-medium text-[#667085]">{label}<input aria-label={`${label} 通道数值`} inputMode="numeric" value={rgb[key]} onChange={(event) => setRgb(key, event.target.value)} className="mt-1 h-8 w-full rounded-lg border border-[#d8deea] bg-white px-1 text-center text-xs font-medium tabular-nums text-[#17223b] outline-none focus:border-[#7b9af2] focus:ring-2 focus:ring-[#315ee7]/10" /></label>)}</div>
      {confirmLabel && <button type="button" onClick={() => { onChange(draft); setOpen(false); }} className="mt-3 h-8 w-full rounded-lg bg-[#315ee7] text-xs font-semibold text-white transition hover:bg-[#2346bb]">{confirmLabel}</button>}
    </div>, document.body)}
  </div>;
}
