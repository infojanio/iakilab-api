import type { FastifyInstance } from 'fastify'
import type { AuthService } from '../../../use-cases/auth/auth-service.js'
import type { ReadReports } from '../../../use-cases/reports/read-reports.js'
import type { PdfStorage } from '../../../lib/pdf-storage.js'
import { verifyJWT } from '../../middlewares/verify-jwt.js'
import { listReports } from './list-reports.js'
import { getReport } from './get-report.js'
import { downloadReportPdf } from './download-report-pdf.js'

export async function reportsRoutes(
  app: FastifyInstance,
  auth: AuthService,
  reports: ReadReports,
  storage: PdfStorage,
) {
  const secure = { preHandler: verifyJWT(auth) }
  app.get('/reports', secure, listReports(auth, reports))
  app.get('/reports/:id', secure, getReport(auth, reports))
  app.get('/pdf/:id', secure, downloadReportPdf(auth, reports, storage))
}
