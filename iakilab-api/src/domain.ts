export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'ANALISTA'
export type Account = { id:string; name:string; email:string; passwordHash:string; globalRole:'USER'|'SUPER_ADMIN'; active:boolean }
export type Membership = {laboratoryId:string; userId:string; role:'ADMIN'|'ANALISTA'; active:boolean; laboratory:{id:string;name:string;active:boolean}}
export type Session = {id:string;userId:string;laboratoryId:string|null;currentRefreshHash:string;expiresAt:Date;revokedAt:Date|null}
export type Actor = {sessionId:string;user:Account;laboratoryId:string|null;role:Role;laboratoryName?:string}
export class AppError extends Error { constructor(public status:number,public code:string){super(code)} }
export const forbidden = () => new AppError(403,'LABORATORY_ACCESS_DENIED')
