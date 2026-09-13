import { z } from "zod";
export const draftSchema = z.object({
  schemaVersion: z.literal(1),
  pages: z.array(z.object({ id:z.string(), sourceAssetId:z.string(), sourcePageIndex:z.number().int().min(0), rotation:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)]), width:z.number().positive(), height:z.number().positive() })).max(100),
  objects: z.array(z.object({ id:z.string(), pageId:z.string(), type:z.enum(["text","image","rect","highlight","line","signature"]), x:z.number(), y:z.number(), width:z.number().positive(), height:z.number().positive(), color:z.string(), opacity:z.number().min(0).max(1), text:z.string().max(2000).optional(), fontSize:z.number().min(6).max(200).optional(), dataUrl:z.string().max(15_000_000).optional() })).max(1000),
});

