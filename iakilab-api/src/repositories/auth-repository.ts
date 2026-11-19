import type {Account,Membership,Session} from '../domain.js'
export interface AuthRepository {
 listMembers(laboratoryId:string):Promise<{id:string;name:string;email:string;role:string;active:boolean}[]>
 findUserByEmail(email:string):Promise<Account|null>
 findUser(id:string):Promise<Account|null>
 memberships(userId:string):Promise<Membership[]>
 laboratory(id:string):Promise<{id:string;name:string;active:boolean}|null>
 createSession(session:Session):Promise<void>
 session(id:string):Promise<Session|null>
 refreshSession(hash:string):Promise<Session|null>
 rotateRefresh(id:string,oldHash:string,newHash:string,now:Date):Promise<boolean>
 revokeSession(id:string):Promise<void>
 createReset(userId:string,tokenHash:string,expiresAt:Date):Promise<void>
 consumeReset(tokenHash:string,passwordHash:string,now:Date):Promise<boolean>
}
