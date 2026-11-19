import type { FastifyRequest } from 'fastify'
import type { ManageReportDrafts } from '../../../use-cases/reports/manage-report-drafts.js'
import { reportDTO } from '../../../use-cases/reports/read-reports.js'
import { identifier, scope } from '../request-scope.js'
import { revision } from './schemas.js'

export function returnReport(service: ManageReportDrafts) {
  return async (req: FastifyRequest) => {
    const updated = await service.transition(
      scope(req),
      identifier(req),
      revision.parse(req.body).revision,
      'return',
    )
    return reportDTO({ ...updated, versions: [] })
  }
}
