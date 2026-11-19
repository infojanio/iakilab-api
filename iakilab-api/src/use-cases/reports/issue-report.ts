import { randomUUID } from 'node:crypto'
import { AppError } from '../../domain.js'
import { token } from '../../lib/crypto.js'
import type { LocalPdfStorage } from '../../lib/pdf-storage.js'
import { renderReportPdf } from '../../lib/render-report-pdf.js'
import type { ReportIssuanceRepository } from '../../repositories/report-issuance-repository.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { AuthService } from '../auth/auth-service.js'
import { requireLaboratoryAdmin, type Scope } from '../laboratory/scope.js'
import { originalFile, reportDTO, verifiedFile } from './read-reports.js'

interface Signer {
  signAndVerify(bytes: Buffer): Promise<Buffer>
}

export class IssueReport {
  constructor(
    private auth: AuthService,
    private reports: ReportsRepository,
    private issuance: ReportIssuanceRepository,
    private storage: Pick<LocalPdfStorage, 'read' | 'savePdf'>,
    private setup?: { signer: Signer; laboratoryId: string; publicOrigin: string },
  ) {}

  async execute(scope: Scope, reportId: string, revision: number) {
    requireLaboratoryAdmin(scope)
    const laboratory = await this.auth.laboratoryProfile(scope.actor, scope.laboratoryId)
    if (!laboratory) throw new AppError(404, 'LABORATORY_NOT_FOUND')
    const report = await this.reports.find(laboratory.id, reportId)
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND')
    if (report.publicCode && verifiedFile(report)) return reportDTO(report)
    if (report.stage !== 'VALIDATED' || report.revision !== revision) {
      throw new AppError(409, 'REPORT_REVISION_OR_STAGE_CONFLICT')
    }
    const setup = this.setup
    if (!setup || laboratory.id !== setup.laboratoryId) {
      throw new AppError(503, 'LABORATORY_SIGNER_UNAVAILABLE')
    }

    const claim = { laboratoryId: laboratory.id, reportId, revision, actorId: scope.actor.user.id, attempt: randomUUID() }
    const now = new Date()
    if (!await this.issuance.claim(claim, now, new Date(now.getTime() - 120_000))) {
      throw new AppError(409, 'ISSUANCE_IN_PROGRESS_OR_CHANGED')
    }

    const code = token()
    const verifyAt = new URL('/consulta', setup.publicOrigin)
    verifyAt.searchParams.set('code', code)
    let stored
    try {
      const original = originalFile(report)
      if (report.kind === 'PDF_UPLOAD' && !original) throw new AppError(422, 'ORIGINAL_PDF_REQUIRED')
      const originalBytes = original && await this.storage.read(original.storageKey, original.sha256, original.byteLength)
      const prepared = await renderReportPdf(report, laboratory.name, verifyAt, originalBytes)
      const signed = await setup.signer.signAndVerify(prepared)
      stored = await this.storage.savePdf(laboratory.id, signed)
    } catch (error) {
      await this.issuance.fail(claim)
      if (error instanceof AppError) throw error
      throw new AppError(502, 'REPORT_SIGNING_FAILED')
    }

    const { discard, ...metadata } = stored
    try {
      if (!await this.issuance.complete(claim, code, metadata)) {
        await discard().catch(() => undefined)
        throw new AppError(409, 'ISSUANCE_IN_PROGRESS_OR_CHANGED')
      }
    } catch (error) {
      // A database transport error can leave commit outcome unknown. Keep the bytes in that case.
      await this.issuance.fail(claim)
      throw error
    }
    const issued = await this.reports.find(laboratory.id, reportId)
    if (!issued) throw new AppError(404, 'REPORT_NOT_FOUND')
    return reportDTO(issued)
  }
}
