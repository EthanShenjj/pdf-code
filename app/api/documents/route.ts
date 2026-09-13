import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { emptyDraft } from "@/lib/editor-types";

export async function GET(request: Request) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error:"未登录" },{ status:401 });
  const q = new URL(request.url).searchParams.get("q")?.slice(0,100);
  const documents = await prisma.document.findMany({ where:{ ownerId:user.id, ...(q ? { name:{ contains:q, mode:"insensitive" } } : {}) }, orderBy:{ updatedAt:"desc" }, include:{ _count:{ select:{ assets:true } } } });
  return NextResponse.json(documents);
}
export async function POST(request: Request) {
  const user = await requireUser(); if (!user) return NextResponse.json({ error:"未登录" },{ status:401 });
  const body = await request.json().catch(()=>({}));
  const doc = await prisma.document.create({ data:{ ownerId:user.id, name:String(body.name || "未命名文档").slice(0,120), draft:emptyDraft() } });
  return NextResponse.json(doc,{ status:201 });
}
export const runtime = "nodejs";

