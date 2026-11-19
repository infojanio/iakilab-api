import {randomUUID} from 'node:crypto'
import {realpath,readFile,mkdir,writeFile,unlink} from 'node:fs/promises'
import path from 'node:path'
import {digest} from './crypto.js'
import {AppError} from '../domain.js'
export interface PdfStorage { read(key:string,sha256:string,byteLength:number):Promise<Buffer> }
export class LocalPdfStorage implements PdfStorage {
 constructor(private root:string){}
 async saveOriginal(laboratoryId:string,bytes:Buffer){
  if(!/^[a-f0-9-]{36}$/i.test(laboratoryId)||bytes.length<8||bytes.length>20*1024*1024||bytes.subarray(0,5).toString()!=='%PDF-')
   throw new AppError(422,'INVALID_PDF')
  const folder=path.resolve(this.root,laboratoryId)
  await mkdir(folder,{recursive:true,mode:0o700})
  const root=await realpath(this.root)
  if(await realpath(folder)!==path.join(root,laboratoryId))throw new AppError(500,'INVALID_STORAGE_PATH')
  const filename=randomUUID()+'.pdf'
  const destination=path.join(root,laboratoryId,filename)
  try{
   await writeFile(destination,bytes,{flag:'wx',mode:0o600})
  }catch(error){
   if(!(error instanceof Error&&'code' in error&&error.code==='EEXIST'))await unlink(destination).catch(()=>undefined)
   throw error
  }
  return {storageKey:laboratoryId+'/'+filename,sha256:digest(bytes),byteLength:bytes.length,discard:()=>unlink(destination)}
 }
 async read(key:string,sha256:string,byteLength:number){
  if(!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.pdf$/.test(key)||byteLength<=0||byteLength>20*1024*1024)throw new AppError(404,'PDF_NOT_FOUND')
  let actual:string,root:string
  try{root=await realpath(this.root);actual=await realpath(path.resolve(root,key))}catch{throw new AppError(404,'PDF_NOT_FOUND')}
  if(!actual.startsWith(root+path.sep))throw new AppError(404,'PDF_NOT_FOUND')
  let buffer:Buffer
  try{buffer=await readFile(actual)}catch{throw new AppError(404,'PDF_NOT_FOUND')}
  if(buffer.length!==byteLength||digest(buffer)!==sha256)throw new AppError(409,'PDF_INTEGRITY_FAILURE')
  return buffer
 }
}
