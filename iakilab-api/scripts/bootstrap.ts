import bcrypt from 'bcryptjs'
import {z} from 'zod'
import {loadConfig} from '../src/config.js'
import {prisma} from '../src/lib/prisma.js'
const { hash } = bcrypt
loadConfig()
const e=z.object({ADMIN_EMAIL:z.string().email().transform(s=>s.trim().toLowerCase()),ADMIN_NAME:z.string().min(2),ADMIN_PASSWORD:z.string().min(12).max(72).refine(s=>Buffer.byteLength(s,'utf8')<=72)}).parse(process.env)
try{
 await prisma.$transaction(async tx=>{
  const laboratory=await tx.laboratory.upsert({where:{slug:'labmoura'},create:{slug:'labmoura',name:'LabMoura'},update:{}})
  // Reruns never reset passwords or elevate an existing account.
  const existing=await tx.user.findUnique({where:{email:e.ADMIN_EMAIL}})
  if(existing)throw new Error('Account already exists; no account or membership was changed')
  const user=await tx.user.create({data:{name:e.ADMIN_NAME,email:e.ADMIN_EMAIL,passwordHash:await hash(e.ADMIN_PASSWORD,12)}})
  await tx.laboratoryMembership.create({data:{laboratoryId:laboratory.id,userId:user.id,role:'ADMIN'}})
 })
 console.log('Homologation laboratory and administrator created')
}finally{await prisma.$disconnect()}
