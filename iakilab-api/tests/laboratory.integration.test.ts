import { PDFDocument } from 'pdf-lib'
import QRCode from 'qrcode'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { PdfA1 } from '../src/lib/pdf-a1.js'
import { PrismaReportIssuanceRepository } from '../src/repositories/prisma/prisma-report-issuance-repository.js'
import { IssueReport } from '../src/use-cases/reports/issue-report.js'
import { ReadPublicReport } from '../src/use-cases/reports/read-public-report.js'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hash } from 'bcryptjs'
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { buildApp } from '../src/app.js'
import { LocalPdfStorage } from '../src/lib/pdf-storage.js'
import { PrismaAuthRepository } from '../src/repositories/prisma/prisma-auth-repository.js'
import { PrismaReportsRepository } from '../src/repositories/prisma/prisma-reports-repository.js'
import { PrismaLaboratoryRepository } from '../src/repositories/prisma/prisma-laboratory-repository.js'
import { AuthService } from '../src/use-cases/auth/auth-service.js'
import {makeLaboratoryUseCases} from '../src/use-cases/_factories/make-laboratory-use-cases.js'
import { PrismaPlatformRepository } from '../src/repositories/prisma/prisma-platform-repository.js'
import {makePlatformUseCases} from '../src/use-cases/_factories/make-platform-use-cases.js'
import { makeReportIssuanceUseCases } from '../src/use-cases/_factories/make-report-issuance-use-cases.js'
import { ReadReports } from '../src/use-cases/reports/read-reports.js'

const enabled = process.env.RUN_POSTGRES_TESTS === 'true'
describe.runIf(enabled)('fluxo de laboratório em PostgreSQL', () => {
  const ids: string[] = []
  const users: string[] = []
  const planIds: string[] = []
  let db: PrismaClient
  let storageDir: string

  afterAll(async () => {
    if (db) {
      const laboratoryId = { in: ids }
      await db.subscription.deleteMany({ where: { laboratoryId } })
      await db.plan.deleteMany({ where: { id: { in: planIds } } })
      await db.reportEvent.deleteMany({ where: { laboratoryId } })
      await db.reportFile.deleteMany({ where: { laboratoryId } })
      await db.reportVersion.deleteMany({ where: { laboratoryId } })
      await db.report.deleteMany({ where: { laboratoryId } })
      await db.client.deleteMany({ where: { laboratoryId } })
      await db.sample.deleteMany({ where: { laboratoryId } })
      await db.session.deleteMany({ where: { userId: { in: users } } })
      await db.laboratoryMembership.deleteMany({ where: { laboratoryId } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.laboratory.deleteMany({ where: { id: { in: ids } } })
      await db.$disconnect()
    }
    if (storageDir) await rm(storageDir, { recursive: true, force: true })
  })

  it('isola cadastros, controla a revisão e registra o PDF original', async () => {
    const url = new URL(process.env.DATABASE_URL ?? '')
    if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.pathname !== '/iakilab_test')
      throw new Error('Use PostgreSQL local exclusivo iakilab_test.')
    db = new PrismaClient()
    storageDir = await mkdtemp(join(tmpdir(), 'iakilab-pdf-test-'))
    const password = 'fixture-password-123'
    const digest = await hash(password, 4)
    for (const role of ['ADMIN', 'ADMIN', 'ANALISTA'] as const) {
      const id = randomUUID()
      const laboratoryId = role === 'ANALISTA' ? ids[0] : id
      if (role !== 'ANALISTA') {
        await db.laboratory.create({ data: { id, name: id, slug: id } })
        ids.push(id)
      }
      await db.user.create({ data: {
        id, name: id, email: id + '@example.test', passwordHash: digest,
        memberships: { create: { laboratoryId, role } },
      } })
      users.push(id)
    }
    const globalId = randomUUID()
    await db.user.create({ data: { id: globalId, name: 'Platform test', email: globalId + '@example.test', passwordHash: digest, globalRole: 'SUPER_ADMIN' } })
    users.push(globalId)
    const origin = 'http://localhost:5173'
    const auth = new AuthService(new PrismaAuthRepository(db), digest)
    const repo = new PrismaReportsRepository(db)
    const storage = new LocalPdfStorage(storageDir)
    const issuance = new PrismaReportIssuanceRepository(db)
    const testA1 = process.env.TEST_A1_DIRECTORY
    const python = process.env.TEST_A1_PYTHON || 'python3'
    const credentials = testA1 && {
      python, trustRoot: join(testA1, 'root.pem'), certificate: join(testA1, 'signer.p12'),
      passwordFile: join(testA1, 'password'),
    }
    const realSigner = credentials ? new PdfA1(credentials) : undefined
    let activeSigner = realSigner
    let failNext = true
    const issue = new IssueReport(auth, repo, issuance, storage, id => id === ids[0] ? {
      publicOrigin: origin, signer: {
        async signAndVerify(bytes) {
          if (failNext || !activeSigner) throw new Error('Simulated signing failure')
          return activeSigner.signAndVerify(bytes)
        },
      },
    } : undefined)
    const app = await buildApp({ jwtSecret: 'z'.repeat(64), origins: [origin], cookieSecure: false, storageRoot: storageDir }, {
      issuance: { issue, publicReport: new ReadPublicReport(issuance, storage) },
      auth, storage, reports: new ReadReports(repo), platform: makePlatformUseCases(new PrismaPlatformRepository(db)), laboratory: makeLaboratoryUseCases(auth, new PrismaLaboratoryRepository(db), repo, storage),
    })
    try {
      const [admin, other, analyst, platform] = await Promise.all(users.map(async id => {
        const response = await app.inject({ method: 'POST', url: '/sessions', headers: { origin }, payload: { email: id + '@example.test', password } })
        expect(response.statusCode).toBe(200)
        return { authorization: 'Bearer ' + response.json().accessToken }
      }))
      if (credentials && testA1) {
        const statusPath = '/reports/a1/status'
        const cases = [
          { status: 'VALID', credentials },
          ...[['expiring', 'EXPIRING_SOON'], ['expired', 'EXPIRED'], ['future', 'NOT_YET_VALID']].map(([folder, status]) => ({
            status, credentials: { ...credentials, certificate: join(testA1, folder, 'signer.p12'), passwordFile: join(testA1, folder, 'password') },
          })),
          { status: 'INVALID_CONFIGURATION', credentials: { ...credentials, passwordFile: join(testA1, 'wrong-password') } },
          { status: 'UNAVAILABLE', credentials: undefined },
        ]
        for (const fixture of cases) {
          const entry = fixture.credentials && { ...fixture.credentials, publicOrigin: origin, laboratoryId: ids[0] }
          const statusApp = await buildApp({ jwtSecret: 'z'.repeat(64), origins: [origin], cookieSecure: false, storageRoot: storageDir }, {
            auth, storage, reports: new ReadReports(repo),
            issuance: makeReportIssuanceUseCases(auth, repo, issuance, storage, entry ? new Map([[ids[0], entry]]) : undefined),
          })
          try {
            const response = await statusApp.inject({ url: statusPath, headers: admin })
            expect(response.statusCode).toBe(200)
            expect(response.json().status).toBe(fixture.status)
            expect(response.body).not.toContain(storageDir)
            expect(Object.keys(response.json()).sort()).toEqual(
              ['UNAVAILABLE','INVALID_CONFIGURATION'].includes(fixture.status) ? ['status'] :
              ['daysUntilExpiry', 'status', 'validFrom', 'validUntil'],
            )
            expect((await statusApp.inject({ url: statusPath, headers: analyst })).statusCode).toBe(403)
            expect((await statusApp.inject({ url: statusPath + '?laboratoryId=' + ids[0], headers: other })).statusCode).toBe(403)
          } finally { await statusApp.close() }
        }
      }
      expect((await app.inject({ url: '/laboratories', headers: admin })).statusCode).toBe(403)
      const laboratories = await app.inject({ url: '/laboratories', headers: platform })
      expect(laboratories.statusCode).toBe(200)
      expect(laboratories.json()).toEqual(expect.arrayContaining(ids.map(id => expect.objectContaining({ id }))))
      const labPayload = { name: 'Laboratório de teste', slug: randomUUID() }
      expect((await app.inject({ method: 'POST', url: '/laboratories', headers: admin, payload: labPayload })).statusCode).toBe(403)
      const registeredLab = await app.inject({ method: 'POST', url: '/laboratories', headers: platform, payload: labPayload })
      expect(registeredLab.statusCode).toBe(201)
      ids.push(registeredLab.json().id)
      const plan = { name: 'Plano piloto', price: '150.25', users: 5, reports: 100, storageGB: 2, active: true }
      expect((await app.inject({ method: 'POST', url: '/plans', headers: admin, payload: plan })).statusCode).toBe(403)
      const registeredPlan = await app.inject({ method: 'POST', url: '/plans', headers: platform, payload: plan })
      expect(registeredPlan.statusCode).toBe(201)
      const planId = registeredPlan.json().id
      planIds.push(planId)
      expect((await app.inject({ method: 'PATCH', url: '/plans/' + planId, headers: platform, payload: { ...plan, reports: 120 } })).statusCode).toBe(200)
      expect((await app.inject({ url: '/plans', headers: platform })).json()).toContainEqual(expect.objectContaining({ id: planId, price: 150.25, reports: 120, storageGB: 2 }))
      const subscription = { laboratoryId: registeredLab.json().id, planId, startsAt: '2026-11-01', expiresAt: '2027-01-01' }
      expect((await app.inject({ method: 'POST', url: '/subscriptions', headers: admin, payload: subscription })).statusCode).toBe(403)
      expect((await app.inject({ method: 'POST', url: '/subscriptions', headers: platform, payload: { ...subscription, expiresAt: subscription.startsAt } })).statusCode).toBe(400)
      const bookings = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/subscriptions', headers: platform, payload: subscription })))
      expect(bookings.map(result => result.statusCode).sort()).toEqual([201, 409])
      const client = await app.inject({ method: 'POST', url: '/clients', headers: admin, payload: { name: 'Cliente A', email: 'a@example.test', phone: '123', document: '', address: '' } })
      expect(client.statusCode).toBe(201)
      expect((await app.inject({ method: 'PATCH', url: '/clients/' + client.json().id, headers: admin, payload: { name: 'Novo nome' } })).json().phone).toBe('123')
      expect((await app.inject({ url: '/clients/' + client.json().id, headers: other })).statusCode).toBe(404)
      expect((await app.inject({ url: '/clients?laboratoryId=' + ids[0], headers: other })).statusCode).toBe(403)
      const sample = await app.inject({ method: 'POST', url: '/samples', headers: analyst, payload: { identification: 'A-01', type: 'Water', origin: 'Coleta', status: 'Recebida', collectedAt: '2026-11-19', analyses: [] } })
      expect(sample.statusCode).toBe(201)
      expect((await app.inject({ url: '/samples', headers: other })).json()).toEqual([])
      expect((await app.inject({ url: '/dashboard/metrics', headers: admin })).json()).toMatchObject({ clients: 1, samples: 1 })
      const draft = {
        identification: 'L-01', customerName: 'Cliente A', reportKind: 'WATER', templateVersion: '1',
        waterResults: [{ id: 'ph', parameter: 'pH', unit: '', method: '', reference: '', group: 'PHYSICOCHEMICAL', result: '7,0', assayDate: '' }],
      }
      const report = await app.inject({ method: 'POST', url: '/reports/drafts', headers: analyst, payload: draft })
      expect(report.statusCode).toBe(201)
      const route = '/reports/' + report.json().id
      const edit = { revision: 1, draft: { ...draft, customerName: 'Cliente A atualizado' } }
      expect((await app.inject({ method: 'PATCH', url: route, headers: other, payload: edit })).statusCode).toBe(404)
      expect((await app.inject({ method: 'PATCH', url: route + '?laboratoryId=' + ids[0], headers: other, payload: edit })).statusCode).toBe(403)
      expect((await app.inject({ method: 'PATCH', url: route, headers: analyst, payload: edit })).json()).toMatchObject({ revision: 2, customerName: edit.draft.customerName })
      expect((await app.inject({ method: 'PATCH', url: route, headers: analyst, payload: edit })).statusCode).toBe(409)
      expect((await app.inject({ method: 'POST', url: route + '/submit', headers: analyst, payload: { revision: 2 } })).statusCode).toBe(200)
      expect((await app.inject({ method: 'POST', url: route + '/return', headers: analyst, payload: { revision: 3 } })).statusCode).toBe(403)
      expect((await app.inject({ method: 'POST', url: route + '/return', headers: admin, payload: { revision: 3 } })).json()).toMatchObject({ revision: 4, status: 'RASCUNHO' })
      expect((await app.inject({ method: 'POST', url: route + '/submit', headers: analyst, payload: { revision: 4 } })).statusCode).toBe(200)
      expect((await app.inject({ method: 'PATCH', url: route + '/validate', headers: analyst, payload: { revision: 5 } })).statusCode).toBe(403)
      const validations = await Promise.all([1, 2].map(() => app.inject({ method: 'PATCH', url: route + '/validate', headers: admin, payload: { revision: 5 } })))
      expect(validations.map(result => result.statusCode).sort()).toEqual([200, 409])
      expect(await db.reportEvent.count({ where: { laboratoryId: ids[0], reportId: report.json().id } })).toBe(6)
      const detail = await app.inject({ url: route, headers: admin })
      expect(detail.json().validationHistory.map((event: { description: string }) => event.description))
        .toEqual(['Rascunho criado', 'Rascunho editado', 'Enviado para revisão', 'Devolvido para ajustes', 'Enviado para revisão', 'Laudo validado'])
      expect((await app.inject({ url: route, headers: other })).statusCode).toBe(404)

      const boundary = 'iakilab-test-boundary'
      const sourcePdf = await PDFDocument.create()
      sourcePdf.addPage()
      const sourceBytes = Buffer.from(await sourcePdf.save())
      const prefix = '--' + boundary + '\r\n'
        + 'Content-Disposition: form-data; name="identification"\r\n\r\nI-01\r\n--' + boundary + '\r\n'
        + 'Content-Disposition: form-data; name="customerName"\r\n\r\nCliente A\r\n--' + boundary + '\r\n'
        + 'Content-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n'
      const importRequest = { method: 'POST' as const, url: '/reports/drafts/import-pdf',
        headers: { ...analyst, 'content-type': 'multipart/form-data; boundary=' + boundary },
        payload: Buffer.concat([Buffer.from(prefix), sourceBytes, Buffer.from('\r\n--' + boundary + '--\r\n')]),
      }
      const imported = await app.inject(importRequest)
      expect(imported.statusCode, imported.body).toBe(201)
      const duplicate = await app.inject(importRequest)
      expect(duplicate.statusCode).toBe(409)
      expect(duplicate.json()).toEqual({ code: 'DUPLICATE_RECORD' })
      expect(await db.report.count({ where: { laboratoryId: ids[0], identification: 'I-01' } })).toBe(1)
      expect(imported.json().signedPdfUrl).toBeUndefined()
      expect((await app.inject({ url: '/pdf/' + imported.json().id, headers: admin })).statusCode).toBe(409)
      const importedDetail = await app.inject({ url: '/reports/' + imported.json().id, headers: admin })
      const originalUrl = importedDetail.json().originalPdfUrl
      expect(originalUrl).toBe('/pdf/' + imported.json().id + '?variant=original')
      const original = await app.inject({ url: originalUrl, headers: admin })
      expect(original.statusCode).toBe(200)
      expect(original.headers['content-type']).toContain('application/pdf')
      expect(original.rawPayload.equals(sourceBytes)).toBe(true)
      expect((await app.inject({ url: originalUrl, headers: other })).statusCode).toBe(404)
      expect((await app.inject({ url: originalUrl })).statusCode).toBe(401)
      const importedRoute = '/reports/' + imported.json().id
      expect((await app.inject({ method: 'POST', url: importedRoute + '/submit', headers: analyst, payload: {revision: 1} })).statusCode).toBe(200)
      expect((await app.inject({ method: 'PATCH', url: importedRoute + '/validate', headers: admin, payload: {revision: 2} })).statusCode).toBe(200)
      const emission = { method: 'POST' as const, url: importedRoute + '/issue', payload: {revision: 3} }
      expect((await app.inject({...emission, headers: analyst})).statusCode).toBe(403)
      expect((await app.inject({...emission, headers: other})).statusCode).toBe(404)
      expect((await app.inject({...emission, headers: admin})).json()).toMatchObject({ code: 'REPORT_SIGNING_FAILED' })
      expect((await app.inject({url: importedRoute, headers: admin})).json()).toMatchObject({ signatureStatus: 'FAILED', revision: 4, issuanceFailureCode: 'REPORT_SIGNING_FAILED' })
      expect((await app.inject({url: '/public/reports/' + imported.json().id})).statusCode).toBe(404)
      if (realSigner && credentials && testA1) {
        failNext = false
        let retryRevision = 4
        const failures = [
          { folder: 'expired', code: 'A1_CERTIFICATE_EXPIRED' },
          { folder: 'future', code: 'A1_CERTIFICATE_NOT_YET_VALID' },
          { passwordFile: join(testA1, 'wrong-password'), code: 'LABORATORY_SIGNER_INVALID_CONFIGURATION' },
          { trustRoot: join(testA1, 'wrong-root.pem'), code: 'REPORT_SIGNATURE_VERIFICATION_FAILED' },
        ]
        for (const { folder, code, ...overrides } of failures) {
          const options = folder ? { certificate: join(testA1, folder, 'signer.p12'), passwordFile: join(testA1, folder, 'password') } : overrides
          activeSigner = new PdfA1({ ...credentials, ...options })
          const failure = await app.inject({...emission, headers: admin, payload: { revision: retryRevision++ }})
          expect(failure.json().code, failure.body).toBe(code)
          const detail = (await app.inject({url: importedRoute, headers: admin})).json()
          expect(detail).toMatchObject({ status: 'VALIDADO', signatureStatus: 'FAILED', revision: retryRevision, issuanceFailureCode: code })
          expect(detail.publicCode).toBeUndefined()
          expect(detail.signedPdfUrl).toBeUndefined()
        }
        activeSigner = realSigner
        const retry = {...emission, headers: admin, payload: {revision: retryRevision}}
        const attempts = await Promise.all([app.inject(retry), app.inject(retry)])
        expect(attempts.map(result => result.statusCode).sort(), attempts.map(result => result.body).join(' | ')).toEqual([200,409])
        const issued = attempts.find(result => result.statusCode===200)!.json()
        expect(issued).toMatchObject({status:'ASSINADO',signatureStatus:'VERIFIED',revision:retryRevision + 1})
        expect((await app.inject(retry)).json().publicCode).toBe(issued.publicCode)
        expect(await db.reportFile.count({ where: { laboratoryId: ids[0], kind: 'SIGNED', version: { reportId: imported.json().id } } })).toBe(1)
        expect(issued.issuanceFailureCode).toBeUndefined()
        const publicPath = '/public/reports/' + issued.publicCode
        const metadata = await app.inject({url:publicPath})
        expect(metadata.json()).toMatchObject({identification:'I-01',signatureStatus:'VERIFIED'})
        expect(metadata.json()).not.toHaveProperty('customerName')
        const final = await app.inject({url:publicPath + '/pdf'})
        expect(final.statusCode).toBe(200)
        expect((await PDFDocument.load(final.rawPayload)).getPageCount()).toBe(2)
        await realSigner.verify(final.rawPayload)
        expect((await app.inject({url:originalUrl,headers:admin})).rawPayload.equals(sourceBytes)).toBe(true)
        const structured = await app.inject({remoteAddress:'192.0.2.1', method:'POST', url:route+'/issue', headers:admin, payload:{revision:6}})
        expect(structured.statusCode, structured.body).toBe(200)
        expect(structured.json().signatureStatus).toBe('VERIFIED')
        await realSigner.verify((await app.inject({url:'/public/reports/'+structured.json().publicCode+'/pdf'})).rawPayload)
        const soil = await app.inject({method:'POST',url:'/reports/drafts',headers:analyst,payload:{
          identification:'SOIL-01',customerName:'Cliente teste',reportKind:'SOIL',templateVersion:'1',
          soilParameters:[{id:'soil-ph',parameter:'pH',unit:'',method:'',reference:'',group:'SOIL'}],
          soilSamples:[{id:'sample-1',analyticalCode:'A-1',identification:'Ponto A',depth:'0–20 cm',results:{'soil-ph':'6,2'}}],
        }})
        expect(soil.statusCode,soil.body).toBe(201)
        const soilRoute = '/reports/' + soil.json().id
        expect((await app.inject({method:'POST',url:soilRoute+'/submit',headers:analyst,payload:{revision:1}})).statusCode).toBe(200)
        expect((await app.inject({method:'PATCH',url:soilRoute+'/validate',headers:admin,payload:{revision:2}})).statusCode).toBe(200)
        const issuedSoil = await app.inject({remoteAddress:'192.0.2.1', method:'POST',url:soilRoute+'/issue',headers:admin,payload:{revision:3}})
        expect(issuedSoil.statusCode,issuedSoil.body).toBe(200)
        const soilPdf = await app.inject({url:'/public/reports/'+issuedSoil.json().publicCode+'/pdf'})
        await realSigner.verify(soilPdf.rawPayload)

        const legacyId = randomUUID()
        const legacyFilename = 'Laudo histórico.pdf'
        const manifest = join(storageDir, 'legacy.json')
        const legacyPdf = await PDFDocument.create()
        const legacyQr = await QRCode.toBuffer('https://legado.example.test/reports/' + legacyId)
        legacyPdf.addPage().drawImage(await legacyPdf.embedPng(legacyQr))
        const legacyBytes = await realSigner.signAndVerify(Buffer.from(await legacyPdf.save()))
        await writeFile(join(storageDir, legacyFilename), legacyBytes)
        await writeFile(manifest, JSON.stringify({laboratoryId:ids[0],reports:[{
          id:legacyId,identification:'LEGADO-01',customerName:'Cliente legado',createdAt:'2025-01-01T10:00:00Z',
          pdf:legacyFilename,legacyPdfFilename:legacyFilename,
        }]}))
        const importer = (manifest: string, mode: string) => promisify(execFile)(
          './node_modules/.bin/tsx', ['scripts/import-legacy-reports.ts',manifest,mode], {env:{
            ...process.env, APP_ENV:'homologation', JWT_SECRET:'z'.repeat(64), WEB_ORIGINS:origin,
            COOKIE_SECURE:'false', STORAGE_ROOT:storageDir, LEGACY_A1_TRUST_ROOT:join(testA1,'root.pem'),
            A1_PYTHON:python,
          }},
        )
        for (const mode of ['--check','--apply','--apply']) await importer(manifest, mode)
        expect(await db.report.count({where:{legacyPublicId:legacyId}})).toBe(1)
        const tampered = Buffer.from(legacyBytes)
        const byte = tampered.indexOf(Buffer.from('%PDF-')) + 7
        tampered[byte] = tampered[byte] === 0x37 ? 0x36 : 0x37
        await writeFile(join(storageDir, 'tampered.pdf'), tampered)
        await writeFile(join(storageDir, 'unsigned.pdf'), sourceBytes)
        const triage = join(storageDir, 'triage.json')
        await writeFile(triage, JSON.stringify({laboratoryId:ids[0],reports:['unsigned.pdf','tampered.pdf'].map(pdf=>({
          id:randomUUID(),createdAt:'2025-01-01T10:00:00Z',pdf,
        }))}))
        await expect(importer(triage, '--check')).rejects.toMatchObject({
          code: 1, stderr: expect.stringMatching(/PDF_HAS_NO_SIGNATURE[\s\S]*SIGNATURE_VERIFICATION_FAILED/),
        })
        expect((await app.inject({url:'/legacy/reports/'+legacyId})).json().report).toMatchObject({id:legacyId,createdAt:'2025-01-01T10:00:00.000Z'})
        expect((await app.inject({url:'/public/reports/'+legacyId})).json()).toMatchObject({signatureStatus:'VERIFIED'})
        for (const url of [
          ...[legacyFilename,'laudo-'+legacyId+'.pdf'].map(filename => '/legacy/pdf/'+encodeURIComponent(filename)),
          '/public/reports/'+legacyId+'/pdf',
        ]) {
          const historical = await app.inject({url})
          expect(historical.statusCode).toBe(200)
          expect(historical.rawPayload.equals(legacyBytes)).toBe(true)
        }
      }
    } finally { await app.close() }
  }, 180000)
})
