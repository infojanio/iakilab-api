// Example for the frontend homologation branch only. Do not enable against the legacy API.
// The existing <a href> cannot send the in-memory bearer token.
export async function openAuthorizedPdf(apiUrl:string,reportId:string,accessToken:string,laboratoryId?:string){
 const base=new URL(apiUrl)
 const url=new URL(`/pdf/${encodeURIComponent(reportId)}`,base)
 if(laboratoryId)url.searchParams.set('laboratoryId',laboratoryId)
 const response=await fetch(url,{headers:{Authorization:`Bearer ${accessToken}`},credentials:'omit'})
 if(!response.ok)throw new Error(`PDF indisponível: HTTP ${response.status}`)
 if(!response.headers.get('content-type')?.startsWith('application/pdf'))throw new Error('Resposta incompatível')
 const blob=await response.blob();const blobUrl=URL.createObjectURL(blob)
 const anchor=document.createElement('a');anchor.href=blobUrl;anchor.download=`laudo-${reportId}.pdf`;anchor.click()
 setTimeout(()=>URL.revokeObjectURL(blobUrl),60000)
}
