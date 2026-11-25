import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ManageReportDrafts } from '../../../use-cases/reports/manage-report-drafts.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { importReportPdf } from './import-report-pdf.js'
import { createDraft } from './create-draft.js'
import { updateDraft } from './update-draft.js'
import { submitReport } from './submit-report.js'
import { validateReport } from './validate-report.js'
import { previewDraft, previewSavedReport } from './preview-report.js'
import { returnReport } from './return-report.js'

export async function reportDraftRoutes(
  app: FastifyInstance,
  auth: AuthService,
  service: ManageReportDrafts,
) {
  const secure = { preHandler: verifyJWT(auth) }
  const preview = { ...secure, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }
  app.post('/reports/drafts/preview', preview, previewDraft(service))
  app.get('/reports/:id/preview', preview, previewSavedReport(service))
  app.post('/reports/drafts/import-pdf', secure, importReportPdf(service))
  app.post('/reports/drafts', secure, createDraft(service))
  app.patch('/reports/:id', secure, updateDraft(service))
  app.post('/reports/:id/submit', secure, submitReport(service))
  app.patch('/reports/:id/validate', secure, validateReport(service))
  app.post('/reports/:id/return', secure, returnReport(service))
}
