export type Tool = "select" | "text" | "image" | "rect" | "highlight" | "line" | "pen" | "signature";
export type EditorObject = {
  id: string; pageId: string; type: Exclude<Tool, "select" | "image" | "signature"> | "image" | "signature";
  x: number; y: number; width: number; height: number; color: string; opacity: number;
  text?: string; fontSize?: number; dataUrl?: string; points?: { x: number; y: number }[]; strokeWidth?: number;
};
export type DraftPage = { id: string; sourceAssetId: string; sourcePageIndex: number; rotation: 0|90|180|270; width: number; height: number };
export type EditorDraft = { schemaVersion: 1; pages: DraftPage[]; objects: EditorObject[] };
export const emptyDraft = (): EditorDraft => ({ schemaVersion: 1, pages: [], objects: [] });
