import {createHash,randomBytes} from 'node:crypto'
export const token=()=>randomBytes(48).toString('base64url')
export const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex')
