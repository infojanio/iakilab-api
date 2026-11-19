import {beforeAll,afterAll,describe,it,expect} from 'vitest'
import {PrismaClient} from '@prisma/client'
import {randomUUID} from 'node:crypto'
import {hash} from 'bcryptjs'
import {PrismaAuthRepository} from '../src/repositories/prisma/prisma-auth-repository.js'
import {PrismaReportsRepository} from '../src/repositories/prisma/prisma-reports-repository.js'
import {AuthService} from '../src/use-cases/auth/auth-service.js'
import {digest} from '../src/lib/crypto.js'
const enabled=process.env.RUN_POSTGRES_TESTS==='true'
describe.skipIf(!enabled)('PostgreSQL integration (dedicated local iakilab_test only)',()=>{
 let db:PrismaClient,authRepo:PrismaAuthRepository,reports:PrismaReportsRepository,auth:AuthService
 const labs=[randomUUID(),randomUUID()],users=[randomUUID(),randomUUID()],ids=[randomUUID(),randomUUID()],versions=[randomUUID(),randomUUID()]
 const now=new Date(),sha=digest('synthetic-only'),pass='synthetic-test-password'
 beforeAll(async()=>{
  const url=new URL(process.env.DATABASE_URL??'')
  if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||url.pathname!=='/iakilab_test')throw new Error('Integration tests require local iakilab_test')
  db=new PrismaClient();authRepo=new PrismaAuthRepository(db);reports=new PrismaReportsRepository(db)
  const passwordHash=await hash(pass,4);auth=new AuthService(authRepo,passwordHash)
  await db.$transaction(async tx=>{
   for(let i=0;i<2;i++){
    await tx.laboratory.create({data:{id:labs[i],slug:labs[i],name:'Synthetic '+i}})
    await tx.user.create({data:{id:users[i],name:'Synthetic '+i,email:users[i]+'@example.test',passwordHash}})
    await tx.laboratoryMembership.create({data:{laboratoryId:labs[i],userId:users[i],role:'ADMIN'}})
    await tx.report.create({data:{id:ids[i],laboratoryId:labs[i],identification:ids[i],customerName:'Synthetic',kind:'WATER',stage:'ISSUED',draftData:{}}})
    await tx.reportVersion.create({data:{id:versions[i],laboratoryId:labs[i],reportId:ids[i],number:1,snapshot:{},issuedAt:now,signatureStatus:'VERIFIED',signatureVerifiedAt:now,signedSha256:sha}})
    await tx.reportFile.create({data:{laboratoryId:labs[i],versionId:versions[i],kind:'SIGNED',storageKey:labs[i]+'/'+ids[i]+'.pdf',sha256:sha,byteLength:14}})
   }
  })
 },30000)
 afterAll(async()=>{
  if(!db)return
  // Only remove the random IDs created by this suite; never truncate or reset a schema.
  try{await db.$transaction(async tx=>{
   await tx.reportFile.deleteMany({where:{laboratoryId:{in:labs}}});await tx.reportVersion.deleteMany({where:{laboratoryId:{in:labs}}});await tx.report.deleteMany({where:{laboratoryId:{in:labs}}})
   await tx.refreshUse.deleteMany({where:{session:{userId:{in:users}}}});await tx.session.deleteMany({where:{userId:{in:users}}});await tx.passwordReset.deleteMany({where:{userId:{in:users}}})
   await tx.laboratoryMembership.deleteMany({where:{laboratoryId:{in:labs}}});await tx.user.deleteMany({where:{id:{in:users}}});await tx.laboratory.deleteMany({where:{id:{in:labs}}})
  })}finally{await db.$disconnect()}
 })
 it('isolates lists and details in the Prisma implementations',async()=>{
  expect((await reports.list(labs[0],{page:1,perPage:10})).rows.map(r=>r.id)).toEqual([ids[0]])
  expect(await reports.find(labs[0],ids[1])).toBeNull()
 })
 it('selects signed documents based on the latest version',async()=>{
  expect((await reports.list(labs[0],{page:1,perPage:10,signed:true})).total).toBe(1)
  await db.reportVersion.create({data:{laboratoryId:labs[0],reportId:ids[0],number:2,snapshot:{},issuedAt:now,signatureStatus:'FAILED'}})
  expect((await reports.list(labs[0],{page:1,perPage:10,signed:true})).total).toBe(0)
 })
 it('rejects cross-tenant version and file foreign keys',async()=>{
  await expect(db.reportVersion.create({data:{laboratoryId:labs[0],reportId:ids[1],number:3,snapshot:{}}})).rejects.toMatchObject({code:'P2003'})
  await expect(db.reportFile.create({data:{laboratoryId:labs[0],versionId:versions[1],kind:'ORIGINAL',storageKey:randomUUID()+'.pdf',sha256:sha,byteLength:14}})).rejects.toMatchObject({code:'P2003'})
 })
 it('enforces evidence before VERIFIED can be stored',async()=>{
  await expect(db.reportVersion.create({data:{laboratoryId:labs[1],reportId:ids[1],number:4,snapshot:{},signatureStatus:'VERIFIED'}})).rejects.toThrow()
 })
 it('authenticates persisted accounts and enforces current memberships',async()=>{
  const result=await auth.login(users[0]+'@example.test',pass)
  await expect(auth.tenant(result.actor,labs[1])).rejects.toThrow('LABORATORY_ACCESS_DENIED')
  await db.laboratoryMembership.update({where:{laboratoryId_userId:{laboratoryId:labs[0],userId:users[0]}},data:{active:false}})
  await expect(auth.actor(result.actor.sessionId)).rejects.toThrow('LABORATORY_ACCESS_DENIED')
  await db.laboratoryMembership.update({where:{laboratoryId_userId:{laboratoryId:labs[0],userId:users[0]}},data:{active:true}})
 })
 it('atomically rotates a refresh token only once',async()=>{
  const result=await auth.login(users[0]+'@example.test',pass)
  const attempts=await Promise.all([authRepo.rotateRefresh(result.actor.sessionId,digest(result.refreshToken),digest(randomUUID()),new Date()),authRepo.rotateRefresh(result.actor.sessionId,digest(result.refreshToken),digest(randomUUID()),new Date())])
  expect(attempts.filter(Boolean)).toHaveLength(1)
  expect(await authRepo.refreshSession(digest(result.refreshToken))).toBeNull()
  expect((await authRepo.session(result.actor.sessionId))?.revokedAt).not.toBeNull()
 })
})
