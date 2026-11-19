import { PdfA1, type A1Config } from '../../lib/pdf-a1.js'
import type { LocalPdfStorage } from '../../lib/pdf-storage.js'
import type { ReportIssuanceRepository } from '../../repositories/report-issuance-repository.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { AuthService } from '../auth/auth-service.js'
import { IssueReport } from '../reports/issue-report.js'
import { ReadPublicReport } from '../reports/read-public-report.js'

export function makeReportIssuanceUseCases(
  auth: AuthService, reports: ReportsRepository, repository: ReportIssuanceRepository,
  storage: LocalPdfStorage, config?: A1Config,
) {
  const setup = config && { ...config, signer: new PdfA1(config) }
  return {
    issue: new IssueReport(auth, reports, repository, storage, setup),
    publicReport: new ReadPublicReport(repository, storage),
  }
}
