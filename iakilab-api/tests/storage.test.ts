import {it,expect} from 'vitest'
import {mkdtemp,mkdir,writeFile,symlink,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {LocalPdfStorage} from '../src/lib/pdf-storage.js'
import {digest} from '../src/lib/crypto.js'
import {withProcessingWorkspace} from '../src/lib/processing-workspace.js'
it('checks stored bytes and rejects traversal, symlinks and integrity mismatch',async()=>{
 const root=await mkdtemp(join(tmpdir(),'iakilab-storage-test-'));const bytes=Buffer.from('%PDF-synthetic')
 try{await mkdir(join(root,'lab'));await writeFile(join(root,'lab','a.pdf'),bytes);const storage=new LocalPdfStorage(root);expect(await storage.read('lab/a.pdf',digest(bytes),bytes.length)).toEqual(bytes);await expect(storage.read('../other.pdf',digest(bytes),bytes.length)).rejects.toThrow('PDF_NOT_FOUND');await expect(storage.read('lab/a.pdf','wrong',bytes.length)).rejects.toThrow('PDF_INTEGRITY_FAILURE');await symlink('/etc/passwd',join(root,'lab','link.pdf'));await expect(storage.read('lab/link.pdf',digest(bytes),bytes.length)).rejects.toThrow('PDF_NOT_FOUND')}finally{await rm(root,{recursive:true,force:true})}
})
it('gives concurrent processing jobs separate directories and cleans after failure',async()=>{
 let first='',second=''
 await Promise.all([withProcessingWorkspace(async dir=>{first=dir;await writeFile(join(dir,'input.pdf'),'synthetic')}),withProcessingWorkspace(async dir=>{second=dir;await writeFile(join(dir,'input.pdf'),'synthetic')})]);expect(first).not.toBe(second)
 const {access}=await import('node:fs/promises');await expect(access(first)).rejects.toThrow();await expect(access(second)).rejects.toThrow()
 let failed='';await expect(withProcessingWorkspace(async dir=>{failed=dir;throw Error('signing failed')})).rejects.toThrow('signing failed');await expect(access(failed)).rejects.toThrow()
})
