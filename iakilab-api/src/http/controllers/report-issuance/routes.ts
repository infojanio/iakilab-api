import { rectificationHistory, startRectification } from './rectification.js'
import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { IssueReport } from '../../../use-cases/reports/issue-report.js'
import type { ReadPublicReport } from '../../../use-cases/reports/read-public-report.js'
import type { makeReportIssuanceUseCases } from '../../../use-cases/_factories/make-report-issuance-use-cases.js'
import { configureA1 } from './configure-a1.js'
import { scope } from '../request-scope.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { downloadPublicReport } from './download-public-report.js'
import { getPublicReport } from './get-public-report.js'
import { issueReport } from './issue-report.js'
import { legacyReport } from './get-legacy-report.js'
import { legacyReportPdf } from './download-legacy-report.js'

export async function reportIssuanceRoutes(
  app: FastifyInstance, auth: AuthService, useCases: { issue: IssueReport; publicReport: ReadPublicReport; signerStatus?: ReturnType<typeof makeReportIssuanceUseCases>['signerStatus']; configureSigner?: ReturnType<typeof makeReportIssuanceUseCases>['configureSigner']; rectification?: ReturnType<typeof makeReportIssuanceUseCases>['rectification'] },
) {
  app.post('/reports/:id/issue', { preHandler: verifyJWT(auth), config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, issueReport(useCases.issue))
  if (useCases.rectification) {
    const secure = { preHandler: verifyJWT(auth) }
    app.get('/reports/:id/versions', secure, rectificationHistory(useCases.rectification))
    app.post('/reports/:id/rectifications', secure, startRectification(useCases.rectification))
  }
  const { signerStatus } = useCases
  if (signerStatus) {
    app.get('/reports/a1/status', {
      preHandler: verifyJWT(auth), config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    }, request => signerStatus(scope(request)))
  }
  if (useCases.configureSigner) {
    app.post('/reports/a1/configuration', {
      preHandler: verifyJWT(auth), config: { rateLimit: { max: 4, timeWindow: '1 minute' } },
    }, configureA1(useCases.configureSigner))
  }
  const rate = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }
  app.get('/public/reports/:code', rate, getPublicReport(useCases.publicReport))
  app.get('/public/reports/:code/pdf', rate, downloadPublicReport(useCases.publicReport))
  app.get('/legacy/reports/:id', rate, legacyReport(useCases.publicReport))
  app.get('/legacy/pdf/:filename', rate, legacyReportPdf(useCases.publicReport))
}
