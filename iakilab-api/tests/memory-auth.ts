import type {Account,Membership,Session} from '../src/domain.js'
import type {AuthRepository} from '../src/repositories/auth-repository.js'
export class MemoryAuth implements AuthRepository {
 users:Account[]=[];links:Membership[]=[];sessions=new Map<string,Session>();consumed=new Map<string,string>();resets:{userId:string;tokenHash:string;expiresAt:Date;usedAt:Date|null}[]=[]
 async listMembers(laboratoryId:string){return this.links.filter(m=>m.laboratoryId===laboratoryId).map(m=>{const u=this.users.find(u=>u.id===m.userId)!;return {id:u.id,name:u.name,email:u.email,role:m.role,active:u.active&&m.active}})}
 async findUserByEmail(email:string){return this.users.find(u=>u.email===email)??null}
 async findUser(id:string){return this.users.find(u=>u.id===id)??null}
 async memberships(userId:string){return this.links.filter(m=>m.userId===userId)}
 async laboratory(id:string){return this.links.find(m=>m.laboratoryId===id)?.laboratory??null}
 async createSession(s:Session){this.sessions.set(s.id,{...s})}
 async session(id:string){return this.sessions.get(id)??null}
 async refreshSession(hash:string){
  const s=[...this.sessions.values()].find(s=>s.currentRefreshHash===hash)
  if(s)return s
  const old=this.consumed.get(hash);if(old)await this.revokeSession(old)
  return null
 }
 async rotateRefresh(id:string,oldHash:string,newHash:string,now:Date){const s=this.sessions.get(id);if(!s||s.revokedAt||s.expiresAt<=now||s.currentRefreshHash!==oldHash)return false;s.currentRefreshHash=newHash;this.consumed.set(oldHash,id);return true}
 async revokeSession(id:string){const s=this.sessions.get(id);if(s)s.revokedAt=new Date()}
 async createReset(userId:string,tokenHash:string,expiresAt:Date){this.resets.push({userId,tokenHash,expiresAt,usedAt:null})}
 async consumeReset(tokenHash:string,passwordHash:string,now:Date){const r=this.resets.find(r=>r.tokenHash===tokenHash&&!r.usedAt&&r.expiresAt>now);if(!r)return false;const u=this.users.find(u=>u.id===r.userId&&u.active);if(!u)return false;u.passwordHash=passwordHash;for(const reset of this.resets.filter(r=>r.userId===u.id))reset.usedAt=now;for(const s of this.sessions.values())if(s.userId===u.id)s.revokedAt=now;return true}
}
