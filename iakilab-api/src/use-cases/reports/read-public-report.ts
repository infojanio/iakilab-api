import { AppError } from '../../domain.js'
import type { PdfStorage } from '../../lib/pdf-storage.js'
import type { ReportRecord } from '../../repositories/reports-repository.js'
import type { ReportIssuanceRepository } from '../../repositories/report-issuance-repository.js'
import { verifiedFile } from './read-reports.js'

export class ReadPublicReport {
  constructor(
    private repository: Pick<ReportIssuanceRepository, 'findPublished' | 'findPublishedByFilename'>,
    private storage: PdfStorage,
  ) {}

  async execute(code: string) {
    const report = await this.repository.findPublished(code)
    const bytes = await this.read(report)
    if (!report) throw new AppError(404, 'PUBLISHED_REPORT_NOT_FOUND')
    return {
      bytes,
      metadata: {
        identification: report.identification,
        signatureStatus: 'VERIFIED',
        createdAt: report.createdAt.toISOString(),
        issuedAt: report.versions[0].issuedAt?.toISOString(),
        downloadPath: '/public/reports/' + encodeURIComponent(code) + '/pdf',
      },
    }
  }

  async legacyPdf(filename: string) {
    const report = await this.repository.findPublishedByFilename(filename)
    if (report) return this.read(report)
    const alias = /^laudo-([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\.pdf$/i.exec(filename)
    return this.read(alias ? await this.repository.findPublished(alias[1]) : null)
  }

  private async read(report: ReportRecord | null) {
    const file = report && verifiedFile(report)
    if (!report || !file) throw new AppError(404, 'PUBLISHED_REPORT_NOT_FOUND')
    return this.storage.read(file.storageKey, file.sha256, file.byteLength)
  }
}
