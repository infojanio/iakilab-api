import type { FastifyRequest, FastifyReply } from 'fastify'
import type { ManageReportDrafts } from '../../../use-cases/reports/manage-report-drafts.js'
import { identifier, scope } from '../request-scope.js'
import { draftData } from './schemas.js'

export function previewDraft(service: ManageReportDrafts) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const bytes = await service.preview(scope(request), { draft: draftData(request.body, 'preview') })
    return reply.type('application/pdf').send(bytes)
  }
}

export function previewSavedReport(service: ManageReportDrafts) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const bytes = await service.preview(scope(request), { id: identifier(request) })
    return reply.type('application/pdf').send(bytes)
  }
}
