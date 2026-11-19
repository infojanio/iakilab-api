import type { FastifyRequest } from 'fastify'
import type { ManageReportDrafts } from '../../../use-cases/reports/manage-report-drafts.js'
import { z } from 'zod'
import { reportDTO } from '../../../use-cases/reports/read-reports.js'
import { identifier, scope } from '../request-scope.js'
import { draft, draftData } from './schemas.js'

export function updateDraft(service: ManageReportDrafts) {
  return async (req: FastifyRequest) => {
    const body = z
      .object({ revision: z.number().int().min(1), draft })
      .strict()
      .parse(req.body)
    const updated = await service.transition(
      scope(req),
      identifier(req),
      body.revision,
      'edit',
      draftData(body.draft),
    )
    return reportDTO({ ...updated, versions: [] })
  }
}
