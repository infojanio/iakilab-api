import bcrypt from 'bcryptjs'
import {z} from 'zod'
import {loadConfig} from '../src/config.js'
import {prisma} from '../src/lib/prisma.js'
const { hash } = bcrypt
loadConfig()
const e=z.object({LABORATORY_SLUG:z.string().min(1),MEMBER_EMAIL:z.string().email().transform(s=>s.trim().toLowerCase()),MEMBER_NAME:z.string().min(2),MEMBER_ROLE:z.enum(['ADMIN','ANALISTA']),MEMBER_PASSWORD:z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72)}).parse(process.env)
try{
 await prisma.$transaction(async tx=>{
  const laboratory=await tx.laboratory.findUnique({where:{slug:e.LABORATORY_SLUG}})
  if(!laboratory?.active)throw new Error('Active laboratory not found')
  if(await tx.user.findUnique({where:{email:e.MEMBER_EMAIL}}))throw new Error('Account already exists; no changes applied')
  const user=await tx.user.create({data:{name:e.MEMBER_NAME,email:e.MEMBER_EMAIL,passwordHash:await hash(e.MEMBER_PASSWORD,12)}})
  await tx.laboratoryMembership.create({data:{laboratoryId:laboratory.id,userId:user.id,role:e.MEMBER_ROLE}})
 })
 console.log('Homologation member created')
}finally{await prisma.$disconnect()}
