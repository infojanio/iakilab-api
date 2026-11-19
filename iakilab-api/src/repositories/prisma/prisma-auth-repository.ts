import type {PrismaClient} from '@prisma/client'
import type {AuthRepository} from '../auth-repository.js'
import type {Session} from '../../domain.js'
export class PrismaAuthRepository implements AuthRepository {
 constructor(private db:PrismaClient){}
 async listMembers(laboratoryId:string){const links=await this.db.laboratoryMembership.findMany({where:{laboratoryId},include:{user:{select:{id:true,name:true,email:true,active:true}}}});return links.map(m=>({...m.user,role:m.role,active:m.active&&m.user.active}))}
 findUserByEmail(email:string){return this.db.user.findUnique({where:{email}})}
 findUser(id:string){return this.db.user.findUnique({where:{id}})}
 memberships(userId:string){return this.db.laboratoryMembership.findMany({where:{userId},include:{laboratory:true}})}
 laboratory(id:string){return this.db.laboratory.findUnique({where:{id},select:{id:true,name:true,active:true}})}
 async createSession(session:Session){await this.db.session.create({data:session})}
 session(id:string){return this.db.session.findUnique({where:{id}})}
 async refreshSession(hash:string){
  const current=await this.db.session.findUnique({where:{currentRefreshHash:hash}})
  if(current)return current
  const consumed=await this.db.refreshUse.findUnique({where:{hash}})
  if(consumed)await this.revokeSession(consumed.sessionId)
  return null
 }
 async rotateRefresh(id:string,oldHash:string,newHash:string,now:Date){
  return this.db.$transaction(async tx=>{
   const result=await tx.session.updateMany({where:{id,currentRefreshHash:oldHash,revokedAt:null,expiresAt:{gt:now}},data:{currentRefreshHash:newHash}})
   if(result.count!==1)return false
   await tx.refreshUse.create({data:{hash:oldHash,sessionId:id}})
   return true
  })
 }
 async revokeSession(id:string){await this.db.session.updateMany({where:{id},data:{revokedAt:new Date()}})}
 async createReset(userId:string,tokenHash:string,expiresAt:Date){await this.db.passwordReset.create({data:{userId,tokenHash,expiresAt}})}
 async consumeReset(tokenHash:string,passwordHash:string,now:Date){
  return this.db.$transaction(async tx=>{
   const reset=await tx.passwordReset.findUnique({where:{tokenHash}})
   if(!reset||reset.usedAt||reset.expiresAt<=now)return false
   const user=await tx.user.findUnique({where:{id:reset.userId}})
   if(!user?.active)return false
   // Serialize concurrent resets for the same account.
   const locked=await tx.user.updateMany({where:{id:user.id,passwordHash:user.passwordHash,active:true},data:{passwordHash}})
   if(locked.count!==1)return false
   const consumed=await tx.passwordReset.updateMany({where:{id:reset.id,usedAt:null},data:{usedAt:now}})
   if(consumed.count!==1)throw new Error('RESET_CONFLICT')
   await tx.passwordReset.updateMany({where:{userId:user.id,usedAt:null},data:{usedAt:now}})
   await tx.session.updateMany({where:{userId:user.id,revokedAt:null},data:{revokedAt:now}})
   return true
  })
 }
}
