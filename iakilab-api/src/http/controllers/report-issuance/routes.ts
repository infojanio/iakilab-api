import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { IssueReport } from '../../../use-cases/reports/issue-report.js'
import type { ReadPublicReport } from '../../../use-cases/reports/read-public-report.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { downloadPublicReport } from './download-public-report.js'
import { getPublicReport } from './get-public-report.js'
import { issueReport } from './issue-report.js'
import { legacyReport } from './get-legacy-report.js'
import { legacyReportPdf } from './download-legacy-report.js'

export async function reportIssuanceRoutes(
  app: FastifyInstance, auth: AuthService, useCases: { issue: IssueReport; publicReport: ReadPublicReport },
) {
  app.post('/reports/:id/issue', { preHandler: verifyJWT(auth), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, issueReport(useCases.issue))
  const rate = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }
  app.get('/public/reports/:code', rate, getPublicReport(useCases.publicReport))
  app.get('/public/reports/:code/pdf', rate, downloadPublicReport(useCases.publicReport))
  app.get('/legacy/reports/:id', rate, legacyReport(useCases.publicReport))
  app.get('/legacy/pdf/:filename', rate, legacyReportPdf(useCases.publicReport))
}
