import {createContext,useContext,useEffect,useState,type ReactNode} from 'react'
import {Navigate,Outlet} from 'react-router-dom'
import type {User,Role} from '../types/report'
import {authService} from '../services/auth'
import {SECURE_API_ENABLED,setAccessToken} from '../services/api'
const AuthContext=createContext<{user:User|null;isAuthenticated:boolean;isLoading:boolean;signIn:(email:string,password:string)=>Promise<void>;signOut:()=>Promise<void>;refreshSession:()=>Promise<void>}|null>(null)
export function AuthProvider({children}:{children:ReactNode}){const [user,setUser]=useState<User|null>(null);const [isLoading,setLoading]=useState(SECURE_API_ENABLED)
 async function refreshSession(){setLoading(true);try{setUser(await authService.refresh())}catch{setAccessToken(null);setUser(null)}finally{setLoading(false)}}
 useEffect(()=>{if(SECURE_API_ENABLED)void refreshSession();const reset=()=>{setUser(null);setAccessToken(null)};window.addEventListener('iakilab:unauthorized',reset);return()=>window.removeEventListener('iakilab:unauthorized',reset)},[])
 async function signIn(email:string,password:string){setLoading(true);try{setUser(await authService.login(email,password))}finally{setLoading(false)}}
 async function signOut(){try{await authService.logout()}finally{setUser(null)}}
 return <AuthContext.Provider value={{user,isAuthenticated:!!user,isLoading,signIn,signOut,refreshSession}}>{children}</AuthContext.Provider>}
export function useAuth(){const auth=useContext(AuthContext);if(!auth)throw Error('AuthProvider ausente');return auth}
export function PrivateRoute({roles}:{roles:Role[]}){const {user,isLoading}=useAuth();if(isLoading)return <div className="skeleton-page">Validando sessão…</div>;if(!user)return <Navigate to="/login" replace/>;if(!roles.includes(user.role))return <Navigate to="/app" replace/>;return <Outlet/>}
