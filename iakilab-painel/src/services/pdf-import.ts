export const MAX_PDF_BYTES=20*1024*1024
// Inspeção local mínima. Não valida estrutura, malware, assinatura ou autenticidade do documento.
export async function validateLocalPdf(file:File):Promise<void>{
 if(file.size===0)throw new Error('O arquivo está vazio. Selecione um PDF válido.')
 if(file.size>MAX_PDF_BYTES)throw new Error('O PDF deve ter no máximo 20 MB nesta prévia.')
 if(!file.name.toLowerCase().endsWith('.pdf'))throw new Error('Selecione um arquivo com a extensão .pdf.')
 const bytes=new Uint8Array(await file.slice(0,1024).arrayBuffer());const header=new TextDecoder().decode(bytes)
 if(!header.includes('%PDF-'))throw new Error('O arquivo não apresenta um cabeçalho PDF reconhecido. Exporte novamente pelo Office.')
}
