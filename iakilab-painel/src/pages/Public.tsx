import {publicReportsService,type PublicReport} from '../services/resources'
import {useEffect,useState} from 'react'
import {Link,useLocation,useNavigate,useSearchParams} from 'react-router-dom'
import {Eye,EyeOff,ArrowRight,ShieldCheck,FlaskConical,FileText,FileSearch,Search,LockKeyhole,ArrowUpRight,CheckCircle2,QrCode} from 'lucide-react'
import {Brand,Badge,Notice} from '../components/common'
import {useAuth} from '../context/AuthContext'
import {authService} from '../services/auth'
import {SECURE_API_ENABLED} from '../services/api'
export function Login(){const {signIn,isLoading}=useAuth();const nav=useNavigate();const [show,setShow]=useState(false);const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [error,setError]=useState('');const [recover,setRecover]=useState(false);const [message,setMessage]=useState('');async function submit(e:React.FormEvent){e.preventDefault();setError('');setMessage('');if(!SECURE_API_ENABLED){setPassword('');setError(recover?'A recuperação de senha ainda não está conectada. Nenhum e-mail foi enviado.':'O login ainda não está conectado à API de autenticação. Nenhuma senha foi enviada ou armazenada.');return}try{if(recover){await authService.recover(email);setMessage('Se houver uma conta para este e-mail, você receberá as instruções.')}else{await signIn(email,password);setPassword('');nav('/app')}}catch(e){setError(e instanceof Error?e.message:'Não foi possível entrar.')}}return <div className="login-page"><aside className="login-visual"><Brand/><div className="login-copy"><Badge tone="glass">GESTÃO LABORATORIAL, EVOLUÍDA</Badge><h1>Mais clareza.<br/>Mais controle.<br/><em>Do início ao laudo.</em></h1><p>A inteligência que conecta amostras, pessoas e resultados. Tudo em um só lugar.</p><div className="login-feature"><span><FlaskConical size={20}/></span><div><strong>Cada amostra, uma história completa</strong><small>Organização e rastreabilidade em cada etapa.</small></div></div><div className="login-feature"><span><ShieldCheck size={20}/></span><div><strong>Confiança em cada documento</strong><small>Fluxos preparados para validação e assinatura.</small></div></div><div className="login-mini"><div><FileText size={21}/><span>LAUDO LM-2026-0148<strong>Organização que faz a diferença</strong></span><CheckCircle2 size={20}/></div><small>Ilustração da plataforma · dados demonstrativos</small></div></div><footer>IAkiLab © 2026 <span>Inteligência para o seu laboratório.</span></footer><div className="visual-ring ring-one"/><div className="visual-ring ring-two"/></aside><main className="login-main"><div className="login-top"><Link to="/consulta">Verificar um laudo<ArrowUpRight size={15}/></Link></div><div className="login-card"><span className="login-icon"><LockKeyhole size={24}/></span><div className="eyebrow">BEM-VINDO AO IAkiLab</div><h1>{recover?'Recupere seu acesso':'Seu laboratório começa aqui.'}</h1><p>{recover?'Informe o e-mail vinculado à sua conta.':'Entre com sua conta para acessar a plataforma.'}</p><form onSubmit={submit}><label className="field">E-mail<input required type="email" autoComplete="username" placeholder="voce@laboratorio.com.br" value={email} onChange={e=>setEmail(e.target.value)}/></label>{!recover&&<label className="field">Senha<div className="password-input"><input required minLength={6} type={show?'text':'password'} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={e=>setPassword(e.target.value)}/><button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></label>}{!recover&&<button type="button" className="forgot" onClick={()=>{setRecover(true);setError('')}}>Esqueceu sua senha?</button>}{error&&<div className="error" role="alert">{error}</div>}{message&&<div className="notice">{message}</div>}<button className="button primary login-submit" disabled={isLoading}>{isLoading?'Validando sessão…':recover?'Enviar instruções':'Entrar'}<ArrowRight size={17}/></button></form>{recover&&<button className="text-button" onClick={()=>{setRecover(false);setError('')}}>Voltar ao login</button>}<Notice><strong>Integração em desenvolvimento.</strong> Acesso real disponível após a conexão com a API de autenticação.</Notice><div className="login-demo"><span>Quer conhecer a experiência?</span><Link to="/demo/app">Explorar demonstração<ArrowUpRight size={16}/></Link></div></div><div className="login-bottom"><ShieldCheck size={15}/> Nenhum dado de produção é acessado na demonstração.</div></main></div>}
export function PublicConsult() {
 const [params]=useSearchParams()
 const {key}=useLocation()
 const initial=params.get('code')||''
 const [code,setCode]=useState(initial)
 const [submitted,setSubmitted]=useState(initial)
 const [attempt,setAttempt]=useState(0)
 const [state,setState]=useState<{code:string;attempt:number;report?:PublicReport;error?:string}>()
 useEffect(()=>{
  setCode(initial)
  setSubmitted(initial)
 },[initial,key])
 useEffect(()=>{
  if(!submitted||submitted==='DEMO-IAKILAB')return
  let active=true
  publicReportsService.verify(submitted).then(report=>{
   if(active)setState({code:submitted,attempt,report})
  }).catch(error=>{
   if(active)setState({code:submitted,attempt,error:error.message})
  })
  return()=>{active=false}
 },[submitted,attempt])
 const result=state?.code===submitted&&state.attempt===attempt?state:undefined
 const demo=submitted==='DEMO-IAKILAB'
 const pending=Boolean(submitted&&!demo&&!result)
 return <div className="public-page">
  <header><Link className="brand-link" to="/login"><Brand/></Link><Link className="button" to="/login">Área do laboratório<ArrowUpRight size={16}/></Link></header>
  <main>
   <span className="public-search-icon"><FileSearch size={32}/></span>
   <h1>Verificar um laudo</h1>
   <p>Use o código de verificação presente no documento.</p>
   <div className="consult-card"><form onSubmit={event=>{
    event.preventDefault()
    setSubmitted(code.trim())
    setAttempt(value=>value+1)
   }}>
    <label className="field">Código de verificação<div className="consult-input"><QrCode size={20}/>
     <input required value={code} onChange={event=>{setCode(event.target.value);setSubmitted('')}}/>
    </div></label>
    <button className="button primary" disabled={pending}><Search size={17}/>{pending?'Verificando…':'Verificar documento'}</button>
   </form>
    {!SECURE_API_ENABLED&&<button className="code-button" onClick={()=>{setCode('DEMO-IAKILAB');setSubmitted('DEMO-IAKILAB')}}>Ver exemplo fictício</button>}
    {result?.error&&<p className="error" role="alert">{result.error}</p>}
    {demo&&<div className="consult-result" role="status"><Badge tone="demo">EXEMPLO FICTÍCIO</Badge><h3>Documento demonstrativo</h3></div>}
    {result?.report&&<div className="consult-result" role="status">
     <h3>{result.report.identification}</h3><p>Assinatura digital verificada na emissão.</p>
     <Badge tone={result.report.documentStatus==='SUPERSEDED'?'neutral':'assinado'}>
      {result.report.documentStatus==='SUPERSEDED'?'Substituído':'Vigente'}
     </Badge>
     <a className="button primary" href={result.report.downloadUrl} referrerPolicy="no-referrer">
      {result.report.documentStatus==='SUPERSEDED'?'Baixar PDF original':'Baixar PDF assinado'}
     </a>
     {result.report.currentCode&&<Link className="button" to={'/consulta?'+new URLSearchParams({code:result.report.currentCode})}>
      Consultar versão vigente<ArrowRight size={16}/>
     </Link>}
    </div>}
   </div>
  </main>
  <footer>IAkiLab <Link to="/demo/app">Conheça a plataforma<ArrowRight size={14}/></Link></footer>
 </div>
}
