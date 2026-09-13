import type { EditorDraft } from "./editor-types";
export type LocalAsset={id:string;name:string;type:string;data:ArrayBuffer};
export type LocalDocument={id:string;name:string;assets:LocalAsset[];draft:EditorDraft;version:number;updatedAt:number};
const DB="paperkit",STORE="documents";
function open(){return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE,{keyPath:"id"});r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function putDocument(doc:LocalDocument){const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).put(doc);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();}
export async function getDocument(id:string){const db=await open();const value=await new Promise<LocalDocument|undefined>((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return value;}
export async function listDocuments(){const db=await open();const value=await new Promise<LocalDocument[]>((resolve,reject)=>{const r=db.transaction(STORE).objectStore(STORE).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return value.sort((a,b)=>b.updatedAt-a.updatedAt);}
export async function deleteDocument(id:string){const db=await open();await new Promise<void>((resolve,reject)=>{const tx=db.transaction(STORE,"readwrite");tx.objectStore(STORE).delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);});db.close();}

