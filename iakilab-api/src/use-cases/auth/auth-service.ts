import {randomUUID} from 'node:crypto'
import bcrypt from 'bcryptjs'
import type {AuthRepository} from '../../repositories/auth-repository.js'
import {AppError,forbidden,type Actor,type Session} from '../../domain.js'
import {token,digest} from '../../lib/crypto.js'
const { compare,hash } = bcrypt
export interface RecoveryMailer { sendRecovery(email:string,token:string):Promise<void> }
export class AuthService {
 constructor(private repo:AuthRepository,private dummyHash:string,private mailer?:RecoveryMailer){}
 async login(email:string,password:string,laboratoryId?:string){
  const user=await this.repo.findUserByEmail(email)
  const valid=await compare(password,user?.passwordHash??this.dummyHash)
  if(!user?.active||!valid)throw new AppError(401,'INVALID_CREDENTIALS')
  const memberships=(await this.repo.memberships(user.id)).filter(m=>m.active&&m.laboratory.active)
  let selected=laboratoryId??null
  if(user.globalRole!=='SUPER_ADMIN'){
   if(!selected){
    if(memberships.length===0)throw forbidden()
    if(memberships.length>1)throw new AppError(409,'LABORATORY_SELECTION_REQUIRED')
    selected=memberships[0].laboratoryId
   }
   if(!memberships.some(m=>m.laboratoryId===selected))throw forbidden()
  }else if(selected&&!(await this.repo.laboratory(selected))?.active)throw forbidden()
  const refreshToken=token()
  const session:Session={id:randomUUID(),userId:user.id,laboratoryId:selected,currentRefreshHash:digest(refreshToken),expiresAt:new Date(Date.now()+7*86400000),revokedAt:null}
  await this.repo.createSession(session)
  return {actor:await this.actor(session.id),refreshToken}
 }
 async actor(sessionId:string):Promise<Actor>{
  const s=await this.repo.session(sessionId)
  if(!s||s.revokedAt||s.expiresAt<=new Date())throw new AppError(401,'SESSION_EXPIRED')
  const user=await this.repo.findUser(s.userId)
  if(!user?.active)throw new AppError(401,'SESSION_EXPIRED')
  if(user.globalRole==='SUPER_ADMIN'){
   const lab=s.laboratoryId?await this.repo.laboratory(s.laboratoryId):null
   if(s.laboratoryId&&!lab?.active)throw forbidden()
   return {sessionId,user,laboratoryId:s.laboratoryId,role:'SUPER_ADMIN',laboratoryName:lab?.name}
  }
  const m=(await this.repo.memberships(user.id)).find(m=>m.laboratoryId===s.laboratoryId&&m.active&&m.laboratory.active)
  if(!m)throw forbidden()
  return {sessionId,user,laboratoryId:m.laboratoryId,role:m.role,laboratoryName:m.laboratory.name}
 }
 async refresh(refreshToken:string){
  const oldHash=digest(refreshToken);const s=await this.repo.refreshSession(oldHash)
  if(!s)throw new AppError(401,'INVALID_REFRESH_TOKEN')
  const actor=await this.actor(s.id);const next=token()
  if(!await this.repo.rotateRefresh(s.id,oldHash,digest(next),new Date()))throw new AppError(401,'INVALID_REFRESH_TOKEN')
  return {actor,refreshToken:next}
 }
 async logout(refreshToken:string){const s=await this.repo.refreshSession(digest(refreshToken));if(s)await this.repo.revokeSession(s.id)}
 async recover(email:string){
  // Until a real delivery adapter is configured, fail equally for every email.
  if(!this.mailer)throw new AppError(503,'RECOVERY_DELIVERY_NOT_CONFIGURED')
  const u=await this.repo.findUserByEmail(email)
  if(u?.active){const raw=token();await this.repo.createReset(u.id,digest(raw),new Date(Date.now()+15*60000));await this.mailer.sendRecovery(email,raw)}
 }
 async reset(raw:string,password:string){if(!await this.repo.consumeReset(digest(raw),await hash(password,12),new Date()))throw new AppError(400,'INVALID_RESET_TOKEN')}
 async laboratoryProfile(actor:Actor,requested?:string){return this.repo.laboratory(await this.tenant(actor,requested))}
 async members(actor:Actor,requested?:string){if(actor.role==='ANALISTA')throw new AppError(403,'ROLE_NOT_ALLOWED');return this.repo.listMembers(await this.tenant(actor,requested))}
 async tenant(actor:Actor,requested?:string){
  const id=requested??actor.laboratoryId
  if(!id)throw new AppError(400,'LABORATORY_REQUIRED')
  if(actor.role!=='SUPER_ADMIN'&&id!==actor.laboratoryId)throw forbidden()
  if(!(await this.repo.laboratory(id))?.active)throw forbidden()
  return id
 }
}
