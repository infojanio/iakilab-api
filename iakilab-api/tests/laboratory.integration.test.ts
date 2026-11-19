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
import { ManageLaboratory } from '../src/use-cases/laboratory/manage-laboratory.js'
import { PrismaPlatformRepository } from '../src/repositories/prisma/prisma-platform-repository.js'
import { ReadPlatform } from '../src/use-cases/platform/read-platform.js'
import { ReadReports } from '../src/use-cases/reports/read-reports.js'

const enabled = process.env.RUN_POSTGRES_TESTS === 'true'
describe.runIf(enabled)('fluxo de laboratório em PostgreSQL', () => {
  const ids: string[] = []
  const users: string[] = []
  let db: PrismaClient
  let storageDir: string

  afterAll(async () => {
    if (db) {
      const laboratoryId = { in: ids }
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
      auth, storage, reports: new ReadReports(repo), platform: new ReadPlatform(new PrismaPlatformRepository(db)), laboratory: new ManageLaboratory(auth, new PrismaLaboratoryRepository(db), repo, storage),
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
      const client = await app.inject({ method: 'POST', url: '/clients', headers: admin, payload: { name: 'Cliente A', email: 'a@example.test', phone: '123', document: '', address: '' } })
      expect(client.statusCode).toBe(201)
      expect((await app.inject({ method: 'PATCH', url: '/clients/' + client.json().id, headers: admin, payload: { name: 'Novo nome' } })).json().phone).toBe('123')
      expect((await app.inject({ url: '/clients/' + client.json().id, headers: other })).statusCode).toBe(404)
      expect((await app.inject({ url: '/clients?laboratoryId=' + ids[0], headers: other })).statusCode).toBe(403)
      const sample = await app.inject({ method: 'POST', url: '/samples', headers: analyst, payload: { identification: 'A-01', type: 'Water', origin: 'Coleta', status: 'Recebida', collectedAt: '2026-11-19', analyses: [] } })
      expect(sample.statusCode).toBe(201)
      expect((await app.inject({ url: '/samples', headers: other })).json()).toEqual([])
      expect((await app.inject({ url: '/dashboard/metrics', headers: admin })).json()).toMatchObject({ clients: 1, samples: 1 })
      const report = await app.inject({ method: 'POST', url: '/reports/drafts', headers: analyst, payload: {
        identification: 'L-01', customerName: 'Cliente A', reportKind: 'WATER', templateVersion: '1',
        waterResults: [{ id: 'ph', parameter: 'pH', unit: '', method: '', reference: '', group: 'PHYSICOCHEMICAL', result: '7,0', assayDate: '' }],
      } })
      expect(report.statusCode).toBe(201)
      const route = '/reports/' + report.json().id
      expect((await app.inject({ method: 'POST', url: route + '/submit', headers: analyst, payload: { revision: 1 } })).statusCode).toBe(200)
      expect((await app.inject({ method: 'PATCH', url: route + '/validate', headers: analyst, payload: { revision: 2 } })).statusCode).toBe(403)
      const validations = await Promise.all([1, 2].map(() => app.inject({ method: 'PATCH', url: route + '/validate', headers: admin, payload: { revision: 2 } })))
      expect(validations.map(result => result.statusCode).sort()).toEqual([200, 409])
      expect(await db.reportEvent.count({ where: { laboratoryId: ids[0], reportId: report.json().id } })).toBe(3)
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
    } finally { await app.close() }
  }, 15000)
})
