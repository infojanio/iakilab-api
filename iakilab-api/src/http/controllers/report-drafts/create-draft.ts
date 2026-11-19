import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageReportDrafts } from '../../../use-cases/reports/manage-report-drafts.js'
import { reportDTO } from '../../../use-cases/reports/read-reports.js'
import { scope } from '../request-scope.js'
import { draftData } from './schemas.js'

export function createDraft(service: ManageReportDrafts) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const created = await service.createDraft(scope(req), draftData(req.body))
    return reply.code(201).send(reportDTO({ ...created, versions: [] }))
  }
}
