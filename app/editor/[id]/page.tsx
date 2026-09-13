import { EditorShell } from "@/components/editor-shell";
export default async function EditorPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{mode?:string}>}){const [{id},{mode}]=await Promise.all([params,searchParams]);return <EditorShell id={id} initialMode={mode==="merge"||mode==="split"?mode:"edit"}/>}
