import { AppError } from '../../../domain.js'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageLaboratory } from '../../../use-cases/laboratory/manage-laboratory.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { reportDTO } from '../../../use-cases/reports/read-reports.js'

const uuid = z.string().uuid()
const required = z.string().trim().min(1).max(200)
const text = z.string().max(10000)
const client = z.object({
  name: required,
  document: z.string().max(32),
  email: z.union([z.literal(''), z.string().email().max(254)]),
  phone: z.string().max(40),
  address: z.string().max(500),
}).strict()
const sample = z.object({
  identification: required, type: required, origin: required,
  collectedAt: z.union([z.iso.date(), z.iso.datetime({ offset: true })]).transform(value => new Date(value)),
  status: required, analyses: z.array(required).max(100),
}).strict()
const result = z.object({
  id: required, parameter: required, unit: z.string().max(60), method: text,
  reference: text, group: z.enum(['PHYSICOCHEMICAL', 'BACTERIOLOGICAL', 'SOIL']),
}).strict()
const draft = z.object({
  reportKind: z.enum(['WATER', 'SOIL']), templateVersion: z.literal('1'),
  identification: required, customerName: required,
  waterResults: z.array(result.extend({ result: text, assayDate: z.union([z.literal(''), z.iso.date()]) })).max(300).optional(),
  soilParameters: z.array(result).max(300).optional(),
  soilSamples: z.array(z.object({
    id: required, analyticalCode: text, identification: text, depth: text,
    results: z.record(required, text),
  }).strict()).max(100).optional(),
  document: text.optional(), address: text.optional(), phone: text.optional(),
  email: text.optional(), technicianName: text.optional(), sampleOrigin: text.optional(),
  sampleType: text.optional(), entryDate: text.optional(), collectionDate: text.optional(),
  collectionTime: text.optional(), collectionAgent: text.optional(), notes: text.optional(),
  municipality: text.optional(), requester: text.optional(), property: text.optional(),
  crop: text.optional(), resultSentDate: text.optional(), issuedDate: text.optional(),
  sampleMunicipality: text.optional(), latitude: text.optional(), longitude: text.optional(),
  arrivalTime: text.optional(), rainCondition: text.optional(), normativeReference: text.optional(),
  classification: text.optional(), methodology: text.optional(), recommendations: text.optional(),
  technicianRegistration: text.optional(),
}).strict()
const revision = z.object({ revision: z.number().int().min(1) }).strict()
const identifier = (req: FastifyRequest) => z.object({ id: uuid }).parse(req.params).id
const scope = (req: FastifyRequest) => ({
  actor: req.actor,
  laboratoryId: z.object({ laboratoryId: uuid.optional() }).strict().parse(req.query).laboratoryId,
})

function draftData(body: unknown) {
  const data = draft.parse(body)
  return { identification: data.identification, customerName: data.customerName, kind: data.reportKind, draftData: data }
}

export async function laboratoryRoutes(app: FastifyInstance, auth: AuthService, service: ManageLaboratory) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/clients', secure, req => service.listClients(scope(req)))
  app.get('/clients/:id', secure, req => service.client(scope(req), identifier(req)))
  app.post('/clients', secure, async (req, reply) => reply.code(201).send(await service.createClient(scope(req), client.parse(req.body))))
  app.patch('/clients/:id', secure, req => service.updateClient(scope(req), identifier(req), client.partial().parse(req.body)))
  app.delete('/clients/:id', secure, async (req, reply) => {
    await service.archiveClient(scope(req), identifier(req))
    return reply.code(204).send()
  })

  app.get('/samples', secure, req => service.listSamples(scope(req)))
  app.get('/samples/:id', secure, req => service.sample(scope(req), identifier(req)))
  app.post('/samples', secure, async (req, reply) => reply.code(201).send(await service.createSample(scope(req), sample.parse(req.body))))
  app.patch('/samples/:id', secure, req => service.updateSample(scope(req), identifier(req), sample.partial().parse(req.body)))
  app.delete('/samples/:id', secure, async (req, reply) => {
    await service.archiveSample(scope(req), identifier(req))
    return reply.code(204).send()
  })

  app.get('/dashboard/metrics', secure, req => service.metrics(scope(req)))
  app.post('/reports/drafts/import-pdf', secure, async (req, reply) => {
    const context = scope(req)
    const values: Record<string, unknown> = Object.create(null)
    let bytes: Buffer | undefined
    for await (const part of req.parts({ limits: { files: 1, fields: 4, parts: 6, fileSize: 20 * 1024 * 1024, fieldSize: 10000 } })) {
      if (part.type === 'file') {
        bytes = await part.toBuffer()
        if (part.fieldname !== 'file' || part.mimetype !== 'application/pdf') throw new AppError(415, 'PDF_REQUIRED')
      } else {
        if (part.fieldname in values || part.fieldnameTruncated || part.valueTruncated) throw new AppError(400, 'INVALID_MULTIPART_FIELD')
        values[part.fieldname] = part.value
      }
    }
    if (!bytes) throw new AppError(400, 'FILE_REQUIRED')
    const { identification, customerName, notes } = z.object({
      identification: required, customerName: required, notes: text.default(''),
      reportKind: z.literal('PDF_UPLOAD').optional(),
    }).strict().parse(values)
    const created = await service.importPdf(context, { identification, customerName, notes }, bytes)
    return reply.code(201).send(reportDTO({ ...created, versions: [] }))
  })
  app.post('/reports/drafts', secure, async (req, reply) => {
    const created = await service.createDraft(scope(req), draftData(req.body))
    return reply.code(201).send(reportDTO({ ...created, versions: [] }))
  })
  app.patch('/reports/:id', secure, async req => {
    const body = z.object({ revision: z.number().int().min(1), draft }).strict().parse(req.body)
    const updated = await service.transition(scope(req), identifier(req), body.revision, 'edit', draftData(body.draft))
    return reportDTO({ ...updated, versions: [] })
  })
  app.post('/reports/:id/submit', secure, async req => {
    const updated = await service.transition(scope(req), identifier(req), revision.parse(req.body).revision, 'submit')
    return reportDTO({ ...updated, versions: [] })
  })
  app.patch('/reports/:id/validate', secure, async req => {
    const updated = await service.transition(scope(req), identifier(req), revision.parse(req.body).revision, 'validate')
    return reportDTO({ ...updated, versions: [] })
  })
  app.post('/reports/:id/return', secure, async req => {
    const updated = await service.transition(scope(req), identifier(req), revision.parse(req.body).revision, 'return')
    return reportDTO({ ...updated, versions: [] })
  })
}
