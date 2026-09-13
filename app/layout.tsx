import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "纸间 Paperkit — PDF 编辑工具", description: "轻巧、安全的在线 PDF 编辑工作台" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="zh-CN"><body>{children}</body></html>; }
