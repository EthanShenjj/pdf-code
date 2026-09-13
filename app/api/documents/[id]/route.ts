import { DeleteObjectsCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";
import { bucket, s3 } from "@/lib/s3";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
const contextId = async (c:{params:Promise<{id:string}>}) => (await c.params).id;
export async function GET(_:Request,c:{params:Promise<{id:string}>}) {
  const user=await requireUser(); if(!user)return NextResponse.json({error:"未登录"},{status:401}); const id=await contextId(c);
  const doc=await prisma.document.findFirst({where:{id,ownerId:user.id},include:{assets:true}}); return doc?NextResponse.json(doc):NextResponse.json({error:"文档不存在"},{status:404});
}
export async function PATCH(request:Request,c:{params:Promise<{id:string}>}) {
  const user=await requireUser(); if(!user)return NextResponse.json({error:"未登录"},{status:401}); const id=await contextId(c); const body=await request.json();
  const result=await prisma.document.updateMany({where:{id,ownerId:user.id},data:{name:String(body.name||"").trim().slice(0,120)}}); return result.count?NextResponse.json({ok:true}):NextResponse.json({error:"文档不存在"},{status:404});
}
export async function DELETE(_:Request,c:{params:Promise<{id:string}>}) {
  const user=await requireUser(); if(!user)return NextResponse.json({error:"未登录"},{status:401}); const id=await contextId(c); const doc=await prisma.document.findFirst({where:{id,ownerId:user.id},include:{assets:true}}); if(!doc)return NextResponse.json({error:"文档不存在"},{status:404});
  await prisma.document.delete({where:{id}}); if(doc.assets.length) await s3.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:doc.assets.map((a:{storageKey:string})=>({Key:a.storageKey}))}})).catch(()=>undefined); return NextResponse.json({ok:true});
}
export const runtime="nodejs";
