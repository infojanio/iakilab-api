import {mkdtemp,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
// Used by later PDF adapters; never derive temporary names from the uploaded filename.
export async function withProcessingWorkspace<T>(operation:(dir:string)=>Promise<T>):Promise<T>{
 const dir=await mkdtemp(join(tmpdir(),'iakilab-'))
 try{return await operation(dir)}finally{await rm(dir,{recursive:true,force:true})}
}
