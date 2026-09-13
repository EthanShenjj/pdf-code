"use client";
import Link from "next/link";import { Brand } from "./brand";
export function SiteHeader(){return <header className="flex h-[72px] items-center justify-between border-b border-[#e5e9f0] px-6 lg:px-10"><Brand/><nav className="flex items-center gap-2 text-sm"><Link className="rounded-lg px-4 py-2 hover:bg-[#f2f4f7]" href="/documents">我的文档</Link><Link className="rounded-lg border border-[#d8deea] px-4 py-2 font-medium hover:border-[#315ee7]" href="/login">登录</Link></nav></header>}

