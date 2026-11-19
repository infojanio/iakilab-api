import type { A1Config } from './lib/pdf-a1.js'
import {z} from 'zod'
export type Config={jwtSecret:string;origins:string[];cookieSecure:boolean;storageRoot:string;a1?:A1Config}
export function loadConfig():Config {
 const e=z.object({APP_ENV:z.literal('homologation'),DATABASE_URL:z.string().url(),JWT_SECRET:z.string().min(48),WEB_ORIGINS:z.string().min(1),COOKIE_SECURE:z.enum(['true','false']),STORAGE_ROOT:z.string().default('./private-storage')}).parse(process.env)
 const url=new URL(e.DATABASE_URL)
 if(!url.pathname.endsWith('/iakilab_homolog')&&!url.pathname.endsWith('/iakilab_test'))throw new Error('Only iakilab_homolog or iakilab_test databases are allowed')
 if(/REPLACE|CHANGE_ME/.test(e.JWT_SECRET))throw new Error('Replace JWT_SECRET')
 const origins=e.WEB_ORIGINS.split(',').map(s=>s.trim())
 if(origins.some(s=>new URL(s).origin!==s))throw new Error('Use exact origins without paths')
 const settings = [process.env.A1_LABORATORY_ID, process.env.A1_CERTIFICATE_PATH, process.env.A1_PASSWORD_FILE, process.env.A1_TRUST_ROOT, process.env.PUBLIC_REPORT_ORIGIN]
 const a1 = settings.some(value => value !== undefined) ? z.object({
  laboratoryId: z.string().uuid(), certificate: z.string().min(1), passwordFile: z.string().min(1),
  trustRoot: z.string().min(1), python: z.string().min(1),
  publicOrigin: z.string().url().refine(value => {
   const candidate = new URL(value)
   return value === candidate.origin && (candidate.protocol === 'https:' || (candidate.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(candidate.hostname)))
  }),
 }).parse({
  laboratoryId: settings[0], certificate: settings[1], passwordFile: settings[2], trustRoot: settings[3],
  publicOrigin: settings[4], python: process.env.A1_PYTHON ?? 'python3',
 }) : undefined
 return {a1,jwtSecret:e.JWT_SECRET,origins,cookieSecure:e.COOKIE_SECURE==='true',storageRoot:e.STORAGE_ROOT}
}
