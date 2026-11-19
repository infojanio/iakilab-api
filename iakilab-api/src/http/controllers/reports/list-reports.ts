import type { FastifyRequest } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadReports } from '../../../use-cases/reports/read-reports.js'
import { z } from 'zod'
import { AppError } from '../../../domain.js'
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (s) =>
      !Number.isNaN(Date.parse(s)) &&
      new Date(s).toISOString().slice(0, 10) === s,
  )

export function listReports(auth: AuthService, reports: ReadReports) {
  return async (req: FastifyRequest) => {
    const f = z
      .object({
        laboratoryId: z.string().uuid().optional(),
        page: z.coerce.number().int().min(1).max(100000).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
        search: z.string().max(200).optional(),
        status: z
          .enum(['RASCUNHO', 'AGUARDANDO_VALIDACAO', 'VALIDADO', 'ASSINADO'])
          .optional(),
        startDate: date.optional(),
        endDate: date.optional(),
      })
      .strict()
      .parse(req.query)
    if (f.startDate && f.endDate && f.startDate > f.endDate)
      throw new AppError(400, 'INVALID_DATE_RANGE')
    const lab = await auth.tenant(req.actor, f.laboratoryId)
    const stage = f.status
      ? {
          RASCUNHO: 'DRAFT',
          AGUARDANDO_VALIDACAO: 'AWAITING_VALIDATION',
          VALIDADO: 'VALIDATED',
          ASSINADO: undefined,
        }[f.status]
      : undefined
    return reports.list(lab, {
      ...f,
      stage,
      signed: f.status === 'ASSINADO',
      startDate: f.startDate ? new Date(f.startDate) : undefined,
      endDate: f.endDate
        ? new Date(Date.parse(f.endDate) + 86400000)
        : undefined,
    })
  }
}
