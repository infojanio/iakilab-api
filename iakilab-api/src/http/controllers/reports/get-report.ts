import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadReports } from '../../../use-cases/reports/read-reports.js'
import { z } from 'zod'

export function getReport(auth: AuthService, reports: ReadReports) {
  return async (req: FastifyRequest) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const q = z
      .object({ laboratoryId: z.string().uuid().optional() })
      .strict()
      .parse(req.query)
    return reports.detail(await auth.tenant(req.actor, q.laboratoryId), id)
  }
}
