import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ReadPublicReport } from '../../../use-cases/reports/read-public-report.js'
import { publicCode } from './get-public-report.js'

export function downloadPublicReport(useCase: ReadPublicReport) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const { bytes } = await useCase.execute(publicCode(request))
    return reply.type('application/pdf').header('Content-Disposition', 'attachment; filename="laudo.pdf"').send(bytes)
  }
}
