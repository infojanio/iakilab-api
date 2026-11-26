import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ReadPublicReport } from '../../../use-cases/reports/read-public-report.js'

const idParams = z.object({ id: z.string().uuid() })

export function legacyReport(useCase: ReadPublicReport) {
  return async (request: FastifyRequest) => {
    const { id } = idParams.parse(request.params)
    const { metadata } = await useCase.execute(id)
    return { report: {
      id,
      identification: metadata.identification,
      createdAt: metadata.createdAt,
      signedPdfUrl: metadata.downloadPath,
      documentStatus: metadata.documentStatus,
      currentCode: metadata.currentCode,
    } }
  }
}
