import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { bucket,s3 } from "@/lib/s3";
const allowed=["application/pdf","image/png","image/jpeg"];
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const user=await requireUser();if(!user)return NextResponse.json({error:"未登录"},{status:401});const {id}=await params;const body=await request.json();const size=Number(body.size);const mimeType=String(body.mimeType);if(!allowed.includes(mimeType)||!Number.isSafeInteger(size)||size<=0||size>20*1024*1024)return NextResponse.json({error:"文件类型或大小不符合要求"},{status:400});const doc=await prisma.document.findFirst({where:{id,ownerId:user.id}});if(!doc)return NextResponse.json({error:"文档不存在"},{status:404});const used=await prisma.asset.aggregate({where:{document:{ownerId:user.id},status:"READY"},_sum:{size:true}});if((used._sum.size??0)+size>1024**3)return NextResponse.json({error:"账号存储空间不足"},{status:413});
 const assetId=crypto.randomUUID();const key=`users/${user.id}/documents/${id}/${assetId}`;await prisma.asset.create({data:{id:assetId,documentId:id,storageKey:key,fileName:String(body.fileName||"file").slice(0,255),mimeType,size}});const uploadUrl=await getSignedUrl(s3,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:mimeType,ContentLength:size}),{expiresIn:600});return NextResponse.json({assetId,uploadUrl,expiresIn:600},{status:201});
}
export const runtime="nodejs";

