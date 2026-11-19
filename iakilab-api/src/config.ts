import {z} from 'zod'
export type Config={jwtSecret:string;origins:string[];cookieSecure:boolean;storageRoot:string}
export function loadConfig():Config {
 const e=z.object({APP_ENV:z.literal('homologation'),DATABASE_URL:z.string().url(),JWT_SECRET:z.string().min(48),WEB_ORIGINS:z.string().min(1),COOKIE_SECURE:z.enum(['true','false']),STORAGE_ROOT:z.string().default('./private-storage')}).parse(process.env)
 const url=new URL(e.DATABASE_URL)
 if(!url.pathname.endsWith('/iakilab_homolog')&&!url.pathname.endsWith('/iakilab_test'))throw new Error('Only iakilab_homolog or iakilab_test databases are allowed')
 if(/REPLACE|CHANGE_ME/.test(e.JWT_SECRET))throw new Error('Replace JWT_SECRET')
 const origins=e.WEB_ORIGINS.split(',').map(s=>s.trim())
 if(origins.some(s=>new URL(s).origin!==s))throw new Error('Use exact origins without paths')
 return {jwtSecret:e.JWT_SECRET,origins,cookieSecure:e.COOKIE_SECURE==='true',storageRoot:e.STORAGE_ROOT}
}
