import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { ReadPublicReport } from '../../../use-cases/reports/read-public-report.js'

const params = z.object({ code: z.union([z.string().regex(/^[A-Za-z0-9_-]{64}$/), z.string().uuid()]) })

export function publicCode(request: FastifyRequest) {
  return params.parse(request.params).code
}

export function getPublicReport(useCase: ReadPublicReport) {
  return async (request: FastifyRequest) => (await useCase.execute(publicCode(request))).metadata
}
