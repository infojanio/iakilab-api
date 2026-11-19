import type { FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ReadPublicReport } from '../../../use-cases/reports/read-public-report.js'

const filenameParams = z.object({ filename: z.string().min(5).max(255).regex(/^[^\/\\\u0000-\u001f]+\.pdf$/i) })

export function legacyReportPdf(useCase: ReadPublicReport) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { filename } = filenameParams.parse(request.params)
    const bytes = await useCase.legacyPdf(filename)
    return reply.type('application/pdf').header('Content-Disposition', 'inline; filename="laudo.pdf"').send(bytes)
  }
}
