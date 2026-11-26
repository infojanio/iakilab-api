import type { InjectOptions } from 'fastify'
import { PrismaServiceOrderRepository } from '../src/repositories/prisma/prisma-service-order-repository.js'
import { PDFDocument } from 'pdf-lib'
import QRCode from 'qrcode'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile } from 'node:fs/promises'
import { PdfA1 } from '../src/lib/pdf-a1.js'
import { PrismaReportIssuanceRepository } from '../src/repositories/prisma/prisma-report-issuance-repository.js'
import { IssueReport } from '../src/use-cases/reports/issue-report.js'
import { ReadPublicReport } from '../src/use-cases/reports/read-public-report.js'
import { RectifyReport } from '../src/use-cases/reports/rectify-report.js'
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
      await db.serviceOrder.deleteMany({ where: { laboratoryId } })
      await db.session.deleteMany({ where: { userId: { in: users } } })
      await db.laboratoryMembership.deleteMany({ where: { laboratoryId } })
      await db.user.deleteMany({ where: { id: { in: users } } })
      await db.laboratory.deleteMany({ where: { id: { in: ids } } })
      await db.$disconnect()
    }
    if (storageDir) await rm(storageDir, { recursive: true, force: true })
  })

  it('isola cadastros e preserva a emissão, a retificação e os PDFs históricos', async () => {
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
    } : undefined, true)
    const app = await buildApp({ jwtSecret: 'z'.repeat(64), origins: [origin], cookieSecure: false, storageRoot: storageDir }, {
      issuance: { issue, publicReport: new ReadPublicReport(issuance, storage), rectification: new RectifyReport(auth, repo, issuance, true) },
      auth, storage, reports: new ReadReports(repo), platform: makePlatformUseCases(new PrismaPlatformRepository(db)), laboratory: makeLaboratoryUseCases(auth, new PrismaLaboratoryRepository(db), repo, storage, new PrismaServiceOrderRepository(db)),
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
      const secondSample = await app.inject({ method: 'POST', url: '/samples', headers: analyst, payload: {
        identification: 'A-02', type: 'Water', origin: 'Poço 02', collectedAt: '2026-11-19', status: 'Recebida', analyses: [],
      } })
      const foreignSample = await app.inject({ method: 'POST', url: '/samples', headers: other, payload: {
        identification: 'A-01', type: 'Water', origin: 'Outro laboratório', collectedAt: '2026-11-19', status: 'Recebida', analyses: [],
      } })
      expect(secondSample.statusCode).toBe(201)
      expect(foreignSample.statusCode).toBe(201)
      const idsToPrint = [secondSample.json().id, sample.json().id]
      const labelsRequest = { method: 'POST' as const, url: '/samples/labels', payload: { ids: idsToPrint } }
      expect((await app.inject(labelsRequest)).statusCode).toBe(401)
      const beforePrint = await app.inject({ url: '/samples', headers: admin })
      const labels = await app.inject({ ...labelsRequest, headers: analyst })
      expect(labels.statusCode).toBe(200)
      expect(labels.headers['cache-control']).toBe('no-store')
      expect(labels.json()).toEqual([
        { id: idsToPrint[0], identification: 'A-02', origin: 'Poço 02' },
        { id: idsToPrint[1], identification: 'A-01', origin: 'Coleta' },
      ])
      for (const label of labels.json()) {
        const found = beforePrint.json().find((record: { identification: string }) => record.identification === label.identification)
        expect(found?.id).toBe(label.id)
      }
      expect((await app.inject({ ...labelsRequest, headers: analyst })).body).toBe(labels.body)
      expect((await app.inject({ url: '/samples', headers: admin })).body).toBe(beforePrint.body)
      expect((await app.inject({ ...labelsRequest, headers: other })).statusCode).toBe(404)
      const mixed = await app.inject({ ...labelsRequest, headers: analyst, payload: { ids: [idsToPrint[0], foreignSample.json().id] } })
      expect(mixed.statusCode).toBe(404)
      expect(mixed.json()).toMatchObject({ code: 'RECORD_NOT_FOUND' })
      expect(mixed.body).not.toContain('A-02')
      expect(mixed.body).not.toContain('Outro laboratório')
      expect((await app.inject({ ...labelsRequest, headers: analyst, payload: { ids: [idsToPrint[0], idsToPrint[0]] } })).statusCode).toBe(400)
      const thirdSample = await app.inject({ method: 'POST', url: '/samples', headers: analyst, payload: {
        identification: 'A-03', type: 'Water', origin: 'Poço 03', collectedAt: '2026-11-19', status: 'Aguardando recebimento', analyses: [],
      } })
      expect(thirdSample.statusCode).toBe(201)
      const [acceptedId, reservedId, rejectedId] = [sample, secondSample, thirdSample].map(response => response.json().id)
      const createdOrder = await app.inject({ method: 'POST', url: '/service-orders', headers: analyst, payload: { number: 'OS-FICTICIA-01' } })
      expect(createdOrder.statusCode, createdOrder.body).toBe(201)
      const orderRoute = '/service-orders/' + createdOrder.json().id
      const orderDetail = async (headers = admin) => (await app.inject({ url: orderRoute, headers })).json()
      for (const id of [acceptedId, reservedId, rejectedId]) {
        const attachment = await app.inject({ method: 'POST', url: orderRoute + '/samples', headers: analyst, payload: { id } })
        expect(attachment.statusCode, attachment.body).toBe(200)
      }
      expect((await app.inject({ method: 'POST', url: orderRoute + '/samples', headers: analyst, payload: { id: foreignSample.json().id } })).statusCode).toBe(404)
      expect((await app.inject({ url: orderRoute, headers: other })).statusCode).toBe(404)
      expect((await app.inject({ method: 'POST', url: orderRoute + '/visit/complete', headers: other })).statusCode).toBe(404)
      const completed = await app.inject({ method: 'POST', url: orderRoute + '/visit/complete', headers: analyst })
      expect(completed.statusCode).toBe(200)
      const visitCompletedAt = completed.json().visitCompletedAt
      expect(visitCompletedAt).toBeTruthy()
      expect((await orderDetail()).pending).toEqual({ reception: [acceptedId, reservedId, rejectedId], analysis: [], recollection: [], review: [] })
      const inspect = (id: string, decision: string, reason?: string, headers = analyst) =>
        app.inject({ method: 'POST', url: '/samples/' + id + '/inspection', headers, payload: { decision, reason, condition: 'Condição fictícia' } })
      const analysis = (id: string, action='start', headers = analyst) =>
        app.inject({ method: 'POST', url: '/samples/' + id + '/analysis/' + action, headers, ...(action==='result'&&{payload:{result:'Resultado fictício'}}) })
      expect((await analysis(acceptedId)).json().code).toBe('SAMPLE_INSPECTION_REQUIRED')
      expect((await inspect(acceptedId, 'ACCEPTED', undefined, other)).statusCode).toBe(404)
      expect((await inspect(reservedId, 'ACCEPTED_WITH_RESERVATION', '  ')).statusCode).toBe(400)
      expect((await inspect(rejectedId, 'REJECTED')).statusCode).toBe(400)
      const receipts = await Promise.all([inspect(acceptedId, 'ACCEPTED'), inspect(acceptedId, 'ACCEPTED')])
      expect(receipts.map(result=>result.statusCode).sort()).toEqual([200,409])
      expect(receipts.find(result=>result.statusCode===409)?.json().code).toBe('SAMPLE_ALREADY_INSPECTED')
      const received = receipts.find(result=>result.statusCode===200)!.json()
      expect(received).toMatchObject({ receivedById: users[2], receivedByName: users[2], collectedAt: sample.json().collectedAt })
      expect(received.receivedAt).toBeTruthy()
      expect((await inspect(reservedId, 'ACCEPTED_WITH_RESERVATION', 'Chegou com volume abaixo da referência.')).statusCode).toBe(200)
      expect((await inspect(rejectedId, 'REJECTED', 'Frasco danificado.')).statusCode).toBe(200)
      expect((await analysis(rejectedId)).json().code).toBe('SAMPLE_REJECTED')
      expect((await analysis(rejectedId, 'result')).json().code).toBe('SAMPLE_REJECTED')
      expect((await analysis(reservedId, 'start', other)).statusCode).toBe(404)
      expect((await app.inject({method:'PATCH',url:'/samples/'+rejectedId,headers:analyst,payload:{status:'Em análise'}})).statusCode).toBe(409)
      expect((await orderDetail()).pending).toEqual({ reception: [], analysis: [acceptedId,reservedId], recollection: [rejectedId], review: [] })
      expect((await analysis(acceptedId)).statusCode).toBe(200)
      expect((await analysis(reservedId)).json()).toMatchObject({ status:'Em análise', inspectionReason:'Chegou com volume abaixo da referência.' })
      expect((await analysis(acceptedId,'result')).statusCode).toBe(200)
      const currentOrder = await orderDetail()
      expect(currentOrder.visitCompletedAt).toBe(visitCompletedAt)
      expect(currentOrder.pending.analysis).toEqual([reservedId])
      expect(currentOrder.samples.find((row: {id:string})=>row.id===rejectedId)).toMatchObject({inspectionReason:'Frasco danificado.',analysisStartedAt:null})
      expect((await analysis(reservedId,'result')).json()).toMatchObject({analysisResult:'Resultado fictício',inspectionReason:'Chegou com volume abaixo da referência.'})
      expect((await orderDetail()).pending.analysis).toEqual([])
      const orderLabels = await app.inject({ ...labelsRequest, headers: analyst })
      expect(orderLabels.json()).toEqual(expect.arrayContaining([expect.objectContaining({serviceOrderNumber:'OS-FICTICIA-01'})]))
      const draft = {
        identification: 'L-01', customerName: 'Cliente A', reportKind: 'WATER', templateVersion: '1',
        waterResults: [{ id: 'ph', parameter: 'pH', unit: '', method: '', reference: '', group: 'PHYSICOCHEMICAL', result: '7,0', assayDate: '' }],
      }
      const previewRequest = { method: 'POST' as const, url: '/reports/drafts/preview', payload: { ...draft, identification: '', customerName: '' } }
      expect((await app.inject(previewRequest)).statusCode).toBe(401)
      const unsavedPreview = await app.inject({ ...previewRequest, headers: analyst })
      expect(unsavedPreview.statusCode).toBe(200)
      expect(unsavedPreview.headers['content-type']).toContain('application/pdf')
      expect(await db.report.count({ where: { laboratoryId: ids[0] } })).toBe(0)
      const report = await app.inject({ method: 'POST', url: '/reports/drafts', headers: analyst, payload: draft })
      expect(report.statusCode).toBe(201)
      const route = '/reports/' + report.json().id
      expect((await app.inject({ method:'POST',url:orderRoute+'/reports',headers:analyst,payload:{id:report.json().id} })).statusCode).toBe(200)
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
      expect((await orderDetail()).pending.review).toEqual([report.json().id])
      expect((await app.inject({url:route,headers:admin})).json().serviceOrderId).toBe(createdOrder.json().id)
      const validations = await Promise.all([1, 2].map(() => app.inject({ method: 'PATCH', url: route + '/validate', headers: admin, payload: { revision: 5 } })))
      expect(validations.map(result => result.statusCode).sort()).toEqual([200, 409])
      expect((await orderDetail()).pending.review).toEqual([])
      expect((await app.inject({method:'DELETE',url:'/samples/'+rejectedId,headers:admin})).statusCode).toBe(204)
      const withArchived = await orderDetail()
      expect(withArchived.pending.recollection).toEqual([])
      expect(withArchived.samples.find((row:{id:string})=>row.id===rejectedId)).toMatchObject({active:false,inspectionReason:'Frasco danificado.'})
      expect(await db.reportEvent.count({ where: { laboratoryId: ids[0], reportId: report.json().id } })).toBe(6)
      const detail = await app.inject({ url: route, headers: admin })
      expect(detail.json().validationHistory.map((event: { description: string }) => event.description))
        .toEqual(['Rascunho criado', 'Rascunho editado', 'Enviado para revisão', 'Devolvido para ajustes', 'Enviado para revisão', 'Laudo validado'])
      expect((await app.inject({ url: route, headers: other })).statusCode).toBe(404)
      expect((await app.inject({ url: route + '/preview', headers: other })).statusCode).toBe(404)
      const savedPreview = await app.inject({ url: route + '/preview', headers: admin })
      expect(savedPreview.statusCode).toBe(200)
      expect(savedPreview.headers['cache-control']).toBe('no-store')

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
        const structuredPdf = (await app.inject({url:'/public/reports/'+structured.json().publicCode+'/pdf'})).rawPayload
        await realSigner.verify(structuredPdf)
        const previewPages = (await PDFDocument.load(savedPreview.rawPayload)).getPageCount()
        expect((await PDFDocument.load(structuredPdf)).getPageCount()).toBe(previewPages + 1)

        const rectificationRequest = (options: InjectOptions) => app.inject({...options,remoteAddress:'192.0.2.10'})
        const reason = 'Correção interna da leitura de pH.'
        const rectify = {method:'POST' as const,url:route+'/rectifications',payload:{reason}}
        expect((await rectificationRequest(rectify)).statusCode).toBe(401)
        expect((await rectificationRequest({...rectify,headers:analyst})).statusCode).toBe(403)
        expect((await rectificationRequest({...rectify,headers:other})).statusCode).toBe(404)
        expect((await rectificationRequest({...rectify,url:rectify.url+'?laboratoryId='+ids[0],headers:other})).statusCode).toBe(403)
        expect((await rectificationRequest({...rectify,headers:admin,payload:{reason:' '}})).statusCode).toBe(400)
        expect((await rectificationRequest({url:route+'/versions'})).statusCode).toBe(401)
        expect((await rectificationRequest({url:route+'/versions',headers:other})).statusCode).toBe(404)
        const children = await Promise.all([rectificationRequest({...rectify,headers:admin}),rectificationRequest({...rectify,headers:admin})])
        expect(children.map(result=>result.statusCode).sort(),children.map(result=>result.body).join(' | ')).toEqual([201,409])
        const child = children.find(result=>result.statusCode===201)!.json()
        const childRoute = '/reports/'+child.id
        const childDraft = (await rectificationRequest({url:childRoute,headers:admin})).json()
        expect(childDraft).toMatchObject({rectifiesId:structured.json().id,status:'RASCUNHO',revision:1,serviceOrderId:createdOrder.json().id})
        expect(childDraft.draftData).toMatchObject({customerName:edit.draft.customerName,waterResults:draft.waterResults})
        const correctedDraft = {...childDraft.draftData,waterResults:[{...draft.waterResults[0],result:'7,1'}]}
        const changed = await rectificationRequest({method:'PATCH',url:childRoute,headers:analyst,payload:{revision:1,draft:correctedDraft}})
        expect(changed.statusCode,changed.body).toBe(200)
        expect((await rectificationRequest({method:'POST',url:childRoute+'/submit',headers:analyst,payload:{revision:2}})).statusCode).toBe(200)
        expect((await rectificationRequest({method:'PATCH',url:childRoute+'/validate',headers:admin,payload:{revision:3}})).statusCode).toBe(200)
        const oldPath = '/public/reports/'+structured.json().publicCode
        const oldDownload = async () => (await rectificationRequest({url:oldPath+'/pdf'})).rawPayload
        const childIssue = {method:'POST' as const,url:childRoute+'/issue',headers:admin,payload:{revision:4}}
        failNext = true
        expect((await rectificationRequest(childIssue)).json()).toMatchObject({code:'REPORT_SIGNING_FAILED'})
        expect((await rectificationRequest({url:childRoute,headers:admin})).json()).toMatchObject({status:'VALIDADO',revision:5,signatureStatus:'FAILED'})
        expect((await rectificationRequest({url:'/public/reports/'+child.id})).statusCode).toBe(404)
        const before = (await rectificationRequest({url:oldPath})).json()
        expect(before.documentStatus).toBe('CURRENT')
        expect(before).not.toHaveProperty('currentCode')
        expect(await oldDownload()).toEqual(structuredPdf)
        const failedHistory = (await rectificationRequest({url:route+'/versions',headers:analyst})).json()
        expect(failedHistory).toMatchObject({canStart:false,versions:[
          {id:structured.json().id,status:'ISSUED',current:true},
          {id:child.id,status:'ISSUANCE_FAILED',current:false,reason,actorName:users[0]},
        ]})
        failNext = false
        const childRetry = {...childIssue,payload:{revision:5}}
        const publications = await Promise.all([rectificationRequest(childRetry),rectificationRequest(childRetry)])
        expect(publications.map(result=>result.statusCode).sort(),publications.map(result=>result.body).join(' | ')).toEqual([200,409])
        const published = publications.find(result=>result.statusCode===200)!.json()
        expect(published.publicCode).not.toBe(structured.json().publicCode)
        expect((await rectificationRequest(childRetry)).json().publicCode).toBe(published.publicCode)
        expect(await db.reportFile.count({where:{laboratoryId:ids[0],kind:'SIGNED',version:{reportId:child.id}}})).toBe(1)
        const oldMetadata = await rectificationRequest({url:oldPath})
        expect(oldMetadata.json()).toMatchObject({documentStatus:'SUPERSEDED',currentCode:published.publicCode,downloadPath:oldPath+'/pdf'})
        expect(oldMetadata.body).not.toContain(reason)
        expect(oldMetadata.body).not.toContain(users[0])
        expect(await oldDownload()).toEqual(structuredPdf)
        const newPath = '/public/reports/'+published.publicCode
        expect((await rectificationRequest({url:newPath})).json()).toMatchObject({documentStatus:'CURRENT'})
        await realSigner.verify((await rectificationRequest({url:newPath+'/pdf'})).rawPayload)
        expect((await rectificationRequest({url:childRoute+'/versions',headers:admin})).json()).toMatchObject({canStart:true,versions:[
          {number:1,status:'SUPERSEDED',current:false},
          {number:2,status:'ISSUED',current:true,issuerName:users[0]},
        ]})

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

        const legacyRequest = (options: InjectOptions) => app.inject({...options,remoteAddress:'192.0.2.11'})
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
        expect((await legacyRequest({url:'/legacy/reports/'+legacyId})).json().report).toMatchObject({id:legacyId,createdAt:'2025-01-01T10:00:00.000Z'})
        expect((await legacyRequest({url:'/public/reports/'+legacyId})).json()).toMatchObject({signatureStatus:'VERIFIED'})
        const legacyReport = await db.report.findFirstOrThrow({where:{legacyPublicId:legacyId}})
        const usedNumber = await legacyRequest({
          method:'POST',url:'/reports/drafts',headers:analyst,payload:{...draft,identification:'LEGADO-01 - R1'},
        })
        expect(usedNumber.statusCode,usedNumber.body).toBe(201)
        const legacyDraft = await legacyRequest({method:'POST',url:'/reports/'+legacyReport.id+'/rectifications',headers:admin,payload:{reason:'Correção do PDF histórico fictício.'}})
        expect(legacyDraft.statusCode,legacyDraft.body).toBe(201)
        expect(legacyDraft.json().identification).not.toBe(usedNumber.json().identification)
        const legacyChild = '/reports/'+legacyDraft.json().id
        const submitLegacy = {method:'POST' as const,url:legacyChild+'/submit',headers:analyst,payload:{revision:1}}
        expect((await legacyRequest(submitLegacy)).json()).toMatchObject({code:'ORIGINAL_PDF_REQUIRED'})
        const replacePdf = (bytes:Buffer) => ({
          method:'POST' as const, url:legacyChild+'/rectification-pdf',
          headers:{...analyst,'content-type':'multipart/form-data; boundary='+boundary},
          payload:Buffer.concat([
            Buffer.from('--'+boundary+'\r\nContent-Disposition: form-data; name="revision"\r\n\r\n1\r\n--'+boundary+'\r\n'
              +'Content-Disposition: form-data; name="file"; filename="corrected.pdf"\r\nContent-Type: application/pdf\r\n\r\n'),
            bytes, Buffer.from('\r\n--'+boundary+'--\r\n'),
          ]),
        })
        const attemptedUpload = replacePdf(sourceBytes)
        expect((await legacyRequest({...attemptedUpload,headers:{...attemptedUpload.headers,...other}})).statusCode).toBe(404)
        expect((await legacyRequest(replacePdf(legacyBytes))).json()).toMatchObject({code:'ALREADY_SIGNED_ORIGINAL'})
        const correctedPdf = await legacyRequest(replacePdf(sourceBytes))
        expect(correctedPdf.statusCode,correctedPdf.body).toBe(200)
        expect((await legacyRequest({...submitLegacy,payload:{revision:2}})).statusCode).toBe(200)
        expect((await legacyRequest({method:'PATCH',url:legacyChild+'/validate',headers:admin,payload:{revision:3}})).statusCode).toBe(200)
        const legacySuccessor = await legacyRequest({method:'POST',url:legacyChild+'/issue',headers:admin,payload:{revision:4}})
        expect(legacySuccessor.statusCode,legacySuccessor.body).toBe(200)
        expect((await legacyRequest({url:'/legacy/reports/'+legacyId})).json().report).toMatchObject({
          id:legacyId,signedPdfUrl:'/public/reports/'+legacyId+'/pdf',documentStatus:'SUPERSEDED',currentCode:legacySuccessor.json().publicCode,
        })
        expect((await legacyRequest({url:'/public/reports/'+legacyId})).json()).toMatchObject({documentStatus:'SUPERSEDED',currentCode:legacySuccessor.json().publicCode})
        for (const url of [
          ...[legacyFilename,'laudo-'+legacyId+'.pdf'].map(filename => '/legacy/pdf/'+encodeURIComponent(filename)),
          '/public/reports/'+legacyId+'/pdf',
        ]) {
          const historical = await legacyRequest({url})
          expect(historical.statusCode).toBe(200)
          expect(historical.rawPayload.equals(legacyBytes)).toBe(true)
        }
      }
    } finally { await app.close() }
  }, 180000)
})
