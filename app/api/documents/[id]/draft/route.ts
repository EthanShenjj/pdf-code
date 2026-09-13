import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { draftSchema } from "@/lib/validation";
export async function PUT(request:Request,{params}:{params:Promise<{id:string}>}) {
  const user=await requireUser(); if(!user)return NextResponse.json({error:"未登录"},{status:401}); const {id}=await params; const body=await request.json(); const parsed=draftSchema.safeParse(body.draft); if(!parsed.success)return NextResponse.json({error:"草稿格式无效"},{status:400});
  const updated=await prisma.document.updateMany({where:{id,ownerId:user.id,version:Number(body.version)},data:{draft:parsed.data,version:{increment:1}}}); if(!updated.count)return NextResponse.json({error:"文档已在其他窗口更新",code:"VERSION_CONFLICT"},{status:409});
  const doc=await prisma.document.findUnique({where:{id},select:{version:true,updatedAt:true}}); return NextResponse.json(doc);
}
export const runtime="nodejs";

