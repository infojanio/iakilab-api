import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageReportDrafts } from '../../../use-cases/reports/manage-report-drafts.js'
import { z } from 'zod'
import { AppError } from '../../../domain.js'
import { reportDTO } from '../../../use-cases/reports/read-reports.js'
import { identifier, scope } from '../request-scope.js'
import { required, text } from './schemas.js'

export function importReportPdf(service: ManageReportDrafts) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const context = scope(req)
    const { values, bytes } = await readPdfUpload(req)
    const { identification, customerName, notes } = z
      .object({
        identification: required,
        customerName: required,
        notes: text.default(''),
        reportKind: z.literal('PDF_UPLOAD').optional(),
      })
      .strict()
      .parse(values)
    const created = await service.importPdf(
      context,
      { identification, customerName, notes },
      bytes,
    )
    return reply.code(201).send(reportDTO({ ...created, versions: [] }))
  }
}

export function replaceRectificationPdf(service: ManageReportDrafts) {
  return async (request: FastifyRequest) => {
    const context = scope(request)
    const id = identifier(request)
    const { values, bytes } = await readPdfUpload(request)
    const { revision } = z.object({ revision: z.coerce.number().int().min(1) }).strict().parse(values)
    return reportDTO(await service.replaceRectificationPdf(context, id, revision, bytes))
  }
}

async function readPdfUpload(req: FastifyRequest) {
  const values: Record<string, unknown> = Object.create(null)
  let bytes: Buffer | undefined
  for await (const part of req.parts({
    limits: {
      files: 1,
      fields: 4,
      parts: 6,
      fileSize: 20 * 1024 * 1024,
      fieldSize: 10000,
    },
  })) {
    if (part.type === 'file') {
      bytes = await part.toBuffer()
      if (part.fieldname !== 'file' || part.mimetype !== 'application/pdf')
        throw new AppError(415, 'PDF_REQUIRED')
    } else {
      if (
        part.fieldname in values ||
        part.fieldnameTruncated ||
        part.valueTruncated
      )
        throw new AppError(400, 'INVALID_MULTIPART_FIELD')
      values[part.fieldname] = part.value
    }
  }
  if (!bytes) throw new AppError(400, 'FILE_REQUIRED')
  return { values, bytes }
}
