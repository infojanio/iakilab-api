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
    const app = await buildApp({ jwtSecret: 'z'.repeat(64), origins: [origin], cookieSecure: false, storageRoot: storageDir }, {
      auth, storage, reports: new ReadReports(repo), platform: makePlatformUseCases(new PrismaPlatformRepository(db)), laboratory: makeLaboratoryUseCases(auth, new PrismaLaboratoryRepository(db), repo, storage),
    })
    try {
      const [admin, other, analyst, platform] = await Promise.all(users.map(async id => {
        const response = await app.inject({ method: 'POST', url: '/sessions', headers: { origin }, payload: { email: id + '@example.test', password } })
        expect(response.statusCode).toBe(200)
        return { authorization: 'Bearer ' + response.json().accessToken }
      }))
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
      const parts = ['Content-Disposition: form-data; name="identification"\r\n\r\nI-01',
        'Content-Disposition: form-data; name="customerName"\r\n\r\nCliente A',
        'Content-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.7\n%%EOF']
      const imported = await app.inject({ method: 'POST', url: '/reports/drafts/import-pdf',
        headers: { ...analyst, 'content-type': 'multipart/form-data; boundary=' + boundary },
        payload: '--' + boundary + '\r\n' + parts.join('\r\n--' + boundary + '\r\n') + '\r\n--' + boundary + '--\r\n',
      })
      expect(imported.statusCode, imported.body).toBe(201)
      expect(imported.json().signedPdfUrl).toBeUndefined()
      expect((await app.inject({ url: '/pdf/' + imported.json().id, headers: admin })).statusCode).toBe(409)
      const importedDetail = await app.inject({ url: '/reports/' + imported.json().id, headers: admin })
      const originalUrl = importedDetail.json().originalPdfUrl
      expect(originalUrl).toBe('/pdf/' + imported.json().id + '?variant=original')
      const original = await app.inject({ url: originalUrl, headers: admin })
      expect(original.statusCode).toBe(200)
      expect(original.headers['content-type']).toContain('application/pdf')
      expect(original.body).toContain('%PDF-1.7')
      expect((await app.inject({ url: originalUrl, headers: other })).statusCode).toBe(404)
      expect((await app.inject({ url: originalUrl })).statusCode).toBe(401)
    } finally { await app.close() }
  }, 15000)
})
