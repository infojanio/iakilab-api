import {Navigate,Route,Routes,Outlet,useLocation} from 'react-router-dom'
import {AuthProvider,PrivateRoute,useAuth} from './context/AuthContext'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import {Reports,ReportDetail} from './pages/Reports'
import NewReport from './pages/NewReport'
import {Resources,Plans,PlatformDashboard,Validation,Settings} from './pages/Resources'
import {Login,PublicConsult} from './pages/Public'
function LabGate(){const {user}=useAuth();return user?.role==='SUPER_ADMIN'?<Navigate to="/platform" replace/>:<Outlet/>}
function LabIndex(){const {user}=useAuth();return user?.role==='SUPER_ADMIN'?<Navigate to="/platform" replace/>:<Dashboard/>}
function LabRoutes(){return <><Route index element={<LabIndex/>}/><Route path="reports" element={<Reports/>}/><Route path="reports/new" element={<NewReport/>}/><Route path="reports/:id" element={<ReportDetail/>}/><Route path="clients" element={<Resources type="clients"/>}/><Route path="samples" element={<Resources type="samples"/>}/><Route path="validation" element={<Validation/>}/><Route path="users" element={<Resources type="users"/>}/><Route path="settings" element={<Settings/>}/><Route path="laudos" element={<Legacy target="reports"/>}/><Route path="laudos/:id" element={<LegacyDetail/>}/><Route path="novo" element={<Legacy target="reports/new"/>}/><Route path="clientes" element={<Legacy target="clients"/>}/><Route path="amostras" element={<Legacy target="samples"/>}/><Route path="validacao" element={<Legacy target="validation"/>}/><Route path="configuracoes" element={<Legacy target="settings"/>}/></>}
import {useParams} from 'react-router-dom'
function Legacy({target}:{target:string}){const {pathname}=useLocation();return <Navigate to={(pathname.startsWith('/demo')?'/demo/app/':'/app/')+target} replace/>}
function LegacyDetail(){const {id}=useParams();return <Legacy target={'reports/'+id}/>}
function platformRoutes(){return <><Route index element={<PlatformDashboard/>}/><Route path="laboratories" element={<Resources type="laboratories"/>}/><Route path="plans" element={<Plans/>}/><Route path="subscriptions" element={<Resources type="subscriptions"/>}/><Route path="users" element={<Resources type="users"/>}/><Route path="settings" element={<Settings/>}/></>}
export default function App(){return <AuthProvider><Routes><Route path="/" element={<Navigate to="/demo/app" replace/>}/><Route path="/login" element={<Login/>}/><Route path="/consulta" element={<PublicConsult/>}/><Route path="/demo" element={<Outlet/>}><Route path="app" element={<Layout/>}>{LabRoutes()}</Route><Route path="platform" element={<Layout/>}>{platformRoutes()}</Route></Route><Route element={<PrivateRoute roles={['ADMIN','ANALISTA','SUPER_ADMIN']}/>}><Route element={<LabGate/>}><Route path="/app" element={<Layout/>}>{LabRoutes()}</Route></Route></Route><Route element={<PrivateRoute roles={['SUPER_ADMIN']}/>}><Route path="/platform" element={<Layout/>}>{platformRoutes()}</Route></Route><Route path="*" element={<Navigate to="/login" replace/>}/></Routes></AuthProvider>}
