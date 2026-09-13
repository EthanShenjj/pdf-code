import type { DraftPage } from "./editor-types";
export function rotatePage(page:DraftPage):DraftPage{return{...page,rotation:((page.rotation+90)%360) as DraftPage["rotation"]}}
export function movePage<T>(pages:T[],from:number,to:number){const next=[...pages];const [item]=next.splice(from,1);next.splice(to,0,item);return next;}
export function nextVersion(current:number,requested:number){return current===requested?current+1:null;}

