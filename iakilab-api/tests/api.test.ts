import {beforeEach,afterEach,describe,it,expect} from 'vitest'
import {hash} from 'bcryptjs'
import {randomUUID} from 'node:crypto'
import type {FastifyInstance} from 'fastify'
import {buildApp} from '../src/app.js'
import {AuthService} from '../src/use-cases/auth/auth-service.js'
import {ReadReports,reportDTO} from '../src/use-cases/reports/read-reports.js'
import type {ReportRecord} from '../src/repositories/reports-repository.js'
import {MemoryAuth} from './memory-auth.js'
import {digest} from '../src/lib/crypto.js'
const labA=randomUUID(),labB=randomUUID(),userA=randomUUID(),userB=randomUUID(),reportA=randomUUID(),reportB=randomUUID()
const origin='http://localhost:5173',password='testing-only-password'
let app:FastifyInstance,repo:MemoryAuth,auth:AuthService,rows:ReportRecord[],fileReads:number,deliveries:{email:string;token:string}[]
let passwordHash=await hash(password,4)
function row(id:string,lab:string):ReportRecord{
 const now=new Date(),versionId=randomUUID(),sha=digest('%PDF-synthetic-test-only')
 return {id,laboratoryId:lab,identification:id,customerName:'Synthetic customer',kind:'PDF_UPLOAD',stage:'ISSUED',draftData:{notes:'Synthetic',signedPdfUrl:'https://untrusted.invalid/evil'},revision:1,legacyPublicId:null,createdAt:now,updatedAt:now,versions:[{id:versionId,laboratoryId:lab,reportId:id,number:1,snapshot:{},validatedAt:now,validatedBy:userA,issuedAt:now,issuedBy:userA,signatureStatus:'VERIFIED',signatureVerifiedAt:now,signedSha256:sha,createdAt:now,files:[{id:randomUUID(),laboratoryId:lab,versionId,kind:'SIGNED',storageKey:lab+'/'+id+'.pdf',sha256:sha,byteLength:24,createdAt:now}]}]}
}
async function login(email='a@example.test',extra={}){return app.inject({method:'POST',url:'/sessions',headers:{origin},payload:{email,password,...extra}})}
async function session(email='a@example.test'){const r=await login(email);expect(r.statusCode).toBe(200);return {authorization:'Bearer '+r.json().accessToken}}
function cookieOf(r:{headers:Record<string,unknown>}){return String(r.headers['set-cookie']).split(';')[0]}
beforeEach(async()=>{
 repo=new MemoryAuth();deliveries=[];fileReads=0
 repo.users=[{id:userA,name:'A',email:'a@example.test',passwordHash,globalRole:'USER',active:true},{id:userB,name:'B',email:'b@example.test',passwordHash,globalRole:'USER',active:true}]
 repo.links=[{laboratoryId:labA,userId:userA,role:'ADMIN',active:true,laboratory:{id:labA,name:'A',active:true}},{laboratoryId:labB,userId:userB,role:'ANALISTA',active:true,laboratory:{id:labB,name:'B',active:true}}]
 auth=new AuthService(repo,passwordHash,{async sendRecovery(email,token){deliveries.push({email,token})}})
 rows=[row(reportA,labA),row(reportB,labB)]
 const reports=new ReadReports({async list(lab,f){const all=rows.filter(r=>r.laboratoryId===lab&&(!f.search||r.customerName.includes(f.search)));return {rows:all.slice((f.page-1)*f.perPage,f.page*f.perPage),total:all.length}},async find(lab,id){return rows.find(r=>r.laboratoryId===lab&&r.id===id)??null}})
 app=await buildApp({jwtSecret:'test-only-'+ 'x'.repeat(60),origins:[origin],cookieSecure:true,storageRoot:'/unused'},{auth,reports,storage:{async read(){fileReads++;return Buffer.from('%PDF-synthetic-test-only')}}})
})
afterEach(async()=>{await app.close()})
describe('HTTP authentication and tenant enforcement',()=>{
 it('returns access token only, sets secure HttpOnly cookie and returns frontend user shape',async()=>{const r=await login();expect(r.json().refreshToken).toBeUndefined();expect(r.headers['set-cookie']).toContain('HttpOnly');expect(r.headers['set-cookie']).toContain('Secure');expect(r.headers['set-cookie']).toContain('SameSite=None');const me=await app.inject({url:'/users/me',headers:{authorization:'Bearer '+r.json().accessToken}});expect(me.json()).toMatchObject({id:userA,role:'ADMIN',laboratoryId:labA});expect(me.json().passwordHash).toBeUndefined()})
 it('rejects wrong password and unknown email with the same error',async()=>{for(const email of ['a@example.test','missing@example.test']){const r=await app.inject({method:'POST',url:'/sessions',headers:{origin},payload:{email,password:'wrong'}});expect(r.statusCode).toBe(401);expect(r.json().code).toBe('INVALID_CREDENTIALS')}})
 it('exposes linked users only to the administrator of that laboratory',async()=>{const headers=await session();const response=await app.inject({url:'/users',headers});expect(response.statusCode).toBe(200);expect(response.json().users.map((u:{id:string})=>u.id)).toEqual([userA]);expect(response.body).not.toContain('passwordHash');expect((await app.inject({url:'/users?laboratoryId='+labB,headers})).statusCode).toBe(403);expect((await app.inject({url:'/users',headers:await session('b@example.test')})).statusCode).toBe(403)})
 it('returns only the laboratory authorized in the session',async()=>{const headers=await session();expect((await app.inject({url:'/laboratories/me',headers})).json()).toMatchObject({id:labA,name:'A',active:true});expect((await app.inject({url:'/laboratories/me?laboratoryId='+labB,headers})).statusCode).toBe(403)})
 it('requires bearer token on every report/PDF route',async()=>{for(const url of ['/reports','/reports/'+reportA,'/pdf/'+reportA])expect((await app.inject({url})).statusCode).toBe(401);expect(fileReads).toBe(0)})
 it('rejects forged and expired JWTs',async()=>{for(const token of ['abc',app.jwt.sign({sub:userA,sid:randomUUID(),type:'access',exp:1})])expect((await app.inject({url:'/reports',headers:{authorization:'Bearer '+token}})).statusCode).toBe(401)})
 it('lists only the authenticated tenant without requiring a query tenant',async()=>{const r=await app.inject({url:'/reports',headers:await session()});expect(r.statusCode).toBe(200);expect(r.json().reports.map((r:{id:string})=>r.id)).toEqual([reportA]);expect(r.json().totalPages).toBe(1)})
 it('rejects tenant switching through login payload',async()=>{expect((await login('a@example.test',{laboratoryId:labB})).statusCode).toBe(403)})
 it('rejects query tenant injection in list, detail and PDF',async()=>{const headers=await session();for(const path of ['/reports','/reports/'+reportB,'/pdf/'+reportB])expect((await app.inject({url:path+'?laboratoryId='+labB,headers})).statusCode).toBe(403);expect(fileReads).toBe(0)})
 it('hides foreign report existence with 404',async()=>{const headers=await session();for(const path of ['/reports/','/pdf/'])expect((await app.inject({url:path+reportB,headers})).statusCode).toBe(404);expect(fileReads).toBe(0)})
 it('allows analyst to read own tenant but not another',async()=>{const headers=await session('b@example.test');expect((await app.inject({url:'/reports/'+reportB,headers})).statusCode).toBe(200);expect((await app.inject({url:'/reports/'+reportA,headers})).statusCode).toBe(404)})
 it('reflects disabled memberships immediately with an existing JWT',async()=>{const headers=await session();repo.links[0].active=false;expect((await app.inject({url:'/reports',headers})).statusCode).toBe(403)})
 it('reflects disabled user and laboratory immediately',async()=>{const headers=await session();repo.users[0].active=false;expect((await app.inject({url:'/reports',headers})).statusCode).toBe(401);repo.users[0].active=true;repo.links[0].laboratory.active=false;expect((await app.inject({url:'/reports',headers})).statusCode).toBe(403)})
 it('requires explicit scope for global admin and does not list all laboratories',async()=>{repo.users[0].globalRole='SUPER_ADMIN';const headers=await session();expect((await app.inject({url:'/reports',headers})).statusCode).toBe(400);const r=await app.inject({url:'/reports?laboratoryId='+labB,headers});expect(r.json().reports[0].id).toBe(reportB)})
 it('rejects malformed dates, unknown query keys and unbounded pagination',async()=>{const headers=await session();for(const q of ['perPage=1000','page=0','startDate=2026-02-30','startDate=2026-10-30&endDate=2026-01-01','storeId=abc'])expect((await app.inject({url:'/reports?'+q,headers})).statusCode).toBe(400)})
 it('guards session-changing requests against missing and foreign Origin',async()=>{for(const o of [undefined,'https://evil.invalid']){const r=await app.inject({method:'POST',url:'/sessions',headers:o?{origin:o}:{},payload:{email:'a@example.test',password}});expect(r.statusCode).toBe(403)}})
 it('rotates refresh token and refuses old-token reuse, revoking the entire session',async()=>{const r=await login(),cookie=cookieOf(r);const next=await app.inject({method:'POST',url:'/sessions/refresh',headers:{origin,cookie}});expect(next.statusCode).toBe(200);expect(cookieOf(next)).not.toBe(cookie);const again=await app.inject({method:'POST',url:'/sessions/refresh',headers:{origin,cookie}});expect(again.statusCode).toBe(401);expect((await app.inject({url:'/users/me',headers:{authorization:'Bearer '+next.json().accessToken}})).statusCode).toBe(401)})
 it('logout invalidates both the refresh token and issued access tokens',async()=>{const r=await login();const out=await app.inject({method:'POST',url:'/sessions/logout',headers:{origin,cookie:cookieOf(r)}});expect(out.statusCode).toBe(204);expect((await app.inject({url:'/users/me',headers:{authorization:'Bearer '+r.json().accessToken}})).statusCode).toBe(401)})
 it('does not accept refresh cookie alone as PDF authorization',async()=>{const r=await login();expect((await app.inject({url:'/pdf/'+reportA,headers:{cookie:cookieOf(r)}})).statusCode).toBe(401)})
 it('does not accept a refresh token as bearer access token',async()=>{const r=await login();const raw=decodeURIComponent(cookieOf(r).split('=')[1]);expect((await app.inject({url:'/reports',headers:{authorization:'Bearer '+raw}})).statusCode).toBe(401)})
 it('expires sessions server-side independent of JWT expiration',async()=>{const headers=await session();for(const s of repo.sessions.values())s.expiresAt=new Date(0);expect((await app.inject({url:'/reports',headers})).statusCode).toBe(401)})
 it('limits login attempts',async()=>{let r;for(let i=0;i<11;i++)r=await app.inject({method:'POST',url:'/sessions',headers:{origin},payload:{email:'missing@example.test',password:'wrong'}});expect(r!.statusCode).toBe(429)})
})
describe('PDF and signature invariants',()=>{
 it('serves an authorized PDF with no-store and excludes storage keys from DTO',async()=>{const headers=await session();const detail=await app.inject({url:'/reports/'+reportA,headers});expect(detail.json().signedPdfUrl).toBe('/pdf/'+reportA);expect(detail.json().storageKey).toBeUndefined();const pdf=await app.inject({url:detail.json().signedPdfUrl,headers});expect(pdf.statusCode).toBe(200);expect(pdf.headers['content-type']).toBe('application/pdf');expect(pdf.headers['cache-control']).toContain('no-store');expect(fileReads).toBe(1)})
 it('never labels failed, pending, unverified, unissued or mismatched PDFs as signed',async()=>{for(const modify of [(r:ReportRecord)=>r.stage='DRAFT',(r:ReportRecord)=>r.versions[0].signatureStatus='FAILED',(r:ReportRecord)=>r.versions[0].signatureStatus='PENDING',(r:ReportRecord)=>r.versions[0].signatureVerifiedAt=null,(r:ReportRecord)=>r.versions[0].issuedAt=null,(r:ReportRecord)=>r.versions[0].signedSha256='wrong',(r:ReportRecord)=>r.versions[0].files=[]]){const r=row(reportA,labA);modify(r);expect(reportDTO(r).status).not.toBe('ASSINADO');expect(reportDTO(r).signedPdfUrl).toBeUndefined()}})
 it('does not silently return an older signed revision',async()=>{const r=rows[0];r.versions.unshift({...r.versions[0],number:2,signatureStatus:'FAILED'});const headers=await session();expect((await app.inject({url:'/pdf/'+reportA,headers})).statusCode).toBe(409);expect(fileReads).toBe(0)})
 it('does not provide legacy public downloads or write routes in this milestone',async()=>{for(const url of ['/public/reports/'+reportA,'/reports/drafts','/reports/'+reportA+'/sign'])expect((await app.inject({method:'POST',url})).statusCode).toBe(404)})
})
describe('password recovery',()=>{
 it('returns a generic response and sends reset tokens only through the delivery adapter',async()=>{for(const email of ['a@example.test','unknown@example.test']){const r=await app.inject({method:'POST',url:'/password/forgot',headers:{origin},payload:{email}});expect(r.statusCode).toBe(202);expect(r.json().token).toBeUndefined()}expect(deliveries).toHaveLength(1);expect(repo.resets[0].tokenHash).not.toBe(deliveries[0].token)})
 it('consumes reset once and revokes all existing sessions',async()=>{const headers=await session();await auth.recover('a@example.test');const raw=deliveries[0].token;await auth.reset(raw,'new-test-password-strong');await expect(auth.reset(raw,'another-password-strong')).rejects.toThrow('INVALID_RESET_TOKEN');expect((await app.inject({url:'/users/me',headers})).statusCode).toBe(401);expect((await login()).statusCode).toBe(401)})
})
