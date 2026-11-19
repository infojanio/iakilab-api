import {build} from 'esbuild'
import assert from 'node:assert/strict'
import {test} from 'node:test'
async function moduleOf(file, env = {}){const result=await build({entryPoints:[file],bundle:true,write:false,format:'esm',platform:'node',define:{'import.meta.env':JSON.stringify(env)}});return import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'))}
const api=await moduleOf('src/services/api.ts')
const reports=await moduleOf('src/services/reports.ts')
const auth=await moduleOf('src/services/auth.ts')
const resources=await moduleOf('src/services/resources.ts')
let requests=0
globalThis.fetch=async()=>{requests++;throw new Error('Unexpected request')}
test('Legacy API is never called without verified secure backend configuration',async()=>{await assert.rejects(api.request('/reports'));await assert.rejects(auth.authService.login('test@example.com','not-a-real-password'));await assert.rejects(reports.reportsService.list({},'demo'));await assert.rejects(resources.publicReportsService.verify('any'));assert.equal(requests,0)})
test('Emission, validation, signature and upload cannot send mutations',async()=>{for(const operation of ['create','validate','sign','uploadPdf'])await assert.rejects(reports.reportsService[operation]());assert.equal(requests,0)})
test('Report normalization handles arrays and common paginated wrappers',()=>{const row={id:'example',customerName:'Test'};for(const input of [[row],{reports:[row],totalPages:3},{data:[row],meta:{totalPages:3,total:24}},{data:{items:[row],totalPages:3}}])assert.equal(reports.normalizeReports(input).reports[0].id,'example');assert.equal(reports.normalizeReports({data:[row],meta:{totalPages:3,total:24}}).total,24)})
test('Malformed API responses fail explicitly rather than render made-up results',()=>{for(const input of [null,{}, {reports:[{customerName:'No id'}]}, {reports:'private'}])assert.throws(()=>reports.normalizeReports(input))})
test('PDF URLs stay unavailable while the secure API is disabled',()=>{for(const url of ['javascript:alert(1)','https://evil.example/pdf/a.pdf','/pdf/example.pdf'])assert.equal(api.authorizedPdfUrl(url),null)})
const validation=await moduleOf('src/services/validation.ts')
test('Document validation rejects repeated digits, invalid checksums and missing values',()=>{for(const input of ['', '00000000000','11111111111111','12345678901','12345678000199'])assert.equal(validation.validDocument(input),false)})
const templates=await moduleOf('src/data/report-templates.ts')
const pdfImport=await moduleOf('src/services/pdf-import.ts')
test('Water and soil drafts preserve distinct structures without sharing sample results',()=>{const water=templates.createStructuredDraft('WATER');const soil=templates.createStructuredDraft('SOIL');const other=templates.createStructuredDraft('SOIL');assert.equal(water.waterResults.length,3);assert.equal(water.soilSamples.length,0);assert.equal(soil.waterResults.length,0);assert.equal(soil.soilParameters.length,36);soil.soilSamples[0].results['soil-0']='6,00';assert.deepEqual(other.soilSamples[0].results,{});assert.equal(water.waterResults[0].reference,'');assert.ok(templates.waterCatalog.some(p=>p.group==='BACTERIOLOGICAL'));assert.equal(soil.templateVersion,'1')})
test('Soil previews group all samples in sets of three without dropping a sample',()=>{const list=[1,2,3,4,5,6,7];const groups=templates.sampleChunks(list);assert.deepEqual(groups,[[1,2,3],[4,5,6],[7]]);assert.deepEqual(groups.flat(),list)})
test('Local PDF checks reject empty, oversized, renamed and invalid files',async()=>{await assert.rejects(pdfImport.validateLocalPdf(new File([],'empty.pdf')));await assert.rejects(pdfImport.validateLocalPdf(new File(['%PDF-1.7'],'other.txt')));await assert.rejects(pdfImport.validateLocalPdf(new File(['not a PDF'],'invalid.pdf')));await assert.rejects(pdfImport.validateLocalPdf(new File([new Uint8Array(pdfImport.MAX_PDF_BYTES+1)],'oversized.pdf')));await pdfImport.validateLocalPdf(new File(['%PDF-1.7\n%%EOF'],'example.PDF'));assert.equal(requests,0)})
test('Structured draft and PDF import cannot call legacy emission routes',async()=>{await assert.rejects(reports.reportsService.saveDraft(templates.createStructuredDraft('WATER')));await assert.rejects(reports.reportsService.importPdfDraft({reportKind:'PDF_UPLOAD',identification:'DEMO',customerName:'Demo',notes:'',file:new File(['%PDF-1.7'],'demo.pdf')}));assert.equal(requests,0)})
test('Temporary draft row identifiers also work when randomUUID is unavailable',()=>{const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');try{Object.defineProperty(globalThis,'crypto',{configurable:true,value:{}});const first=templates.newDraftId();const second=templates.newDraftId();assert.notEqual(first,second);assert.ok(first.startsWith('local-'));assert.ok(templates.createStructuredDraft('SOIL').soilSamples[0].id)}finally{if(descriptor)Object.defineProperty(globalThis,'crypto',descriptor)}})

test('Enabling the API requires an explicitly configured address', async () => {
  const missingApi = await moduleOf('src/services/api.ts', { VITE_SECURE_API_ENABLED: 'true' })
  assert.equal(missingApi.SECURE_API_ENABLED, false)
  await assert.rejects(missingApi.request('/reports'))
  assert.equal(requests, 0)
})
test('Private PDF requests reject other origins and non-PDF routes', async () => {
  const enabledApi = await moduleOf('src/services/api.ts', {
    VITE_SECURE_API_ENABLED: 'true', VITE_API_URL: 'https://api.example.test',
  })
  const id = '10000000-0000-4000-8000-00000000000a'
  assert.equal(enabledApi.authorizedPdfUrl('/pdf/' + id), 'https://api.example.test/pdf/' + id)
  enabledApi.setAccessToken('test-token')
  for (const value of ['https://other.example.test/pdf/' + id, '/reports/' + id]) {
    await assert.rejects(enabledApi.requestPdf(value), { status: 403 })
  }
  assert.equal(requests, 0)
})
