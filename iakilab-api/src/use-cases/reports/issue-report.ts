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
  signAndVerify(bytes: Buffer, reason: string): Promise<Buffer>
}

export class IssueReport {
  constructor(
    private auth: AuthService,
    private reports: ReportsRepository,
    private issuance: ReportIssuanceRepository,
    private storage: Pick<LocalPdfStorage, 'read' | 'savePdf'>,
    private resolveSigner: (laboratoryId: string) => { signer: Signer; publicOrigin: string } | undefined | Promise<{ signer: Signer; publicOrigin: string } | undefined>,
    private rectificationEnabled = false,
  ) {}

  async execute(scope: Scope, reportId: string, revision: number) {
    requireLaboratoryAdmin(scope)
    const laboratory = await this.auth.laboratoryProfile(scope.actor, scope.laboratoryId)
    if (!laboratory) throw new AppError(404, 'LABORATORY_NOT_FOUND')
    const report = await this.reports.find(laboratory.id, reportId)
    if (!report) throw new AppError(404, 'REPORT_NOT_FOUND')
    if (report.publicCode && verifiedFile(report)) return reportDTO(report)
    if (report.rectifiesId && !this.rectificationEnabled) throw new AppError(403, 'RECTIFICATION_DISABLED')
    if (report.stage !== 'VALIDATED' || report.revision !== revision) {
      throw new AppError(409, 'REPORT_REVISION_OR_STAGE_CONFLICT')
    }
    const claim = { laboratoryId: laboratory.id, reportId, revision, actorId: scope.actor.user.id, attempt: randomUUID() }
    const now = new Date()
    if (!await this.issuance.claim(claim, now, new Date(now.getTime() - 120_000))) {
      throw new AppError(409, 'ISSUANCE_IN_PROGRESS_OR_CHANGED')
    }

    const code = token()
    let stored
    try {
      const setup = await this.resolveSigner(laboratory.id)
      if (!setup) throw new AppError(503, 'LABORATORY_SIGNER_UNAVAILABLE')
      const verifyAt = new URL('/consulta', setup.publicOrigin)
      verifyAt.searchParams.set('code', code)
      const original = originalFile(report)
      if (report.kind === 'PDF_UPLOAD' && !original) throw new AppError(422, 'ORIGINAL_PDF_REQUIRED')
      const originalBytes = original && await this.storage.read(original.storageKey, original.sha256, original.byteLength)
      const prepared = await renderReportPdf(report, laboratory.name, verifyAt, originalBytes)
      const signed = await setup.signer.signAndVerify(prepared, 'Laudo emitido por ' + laboratory.name)
      stored = await this.storage.savePdf(laboratory.id, signed)
    } catch (error) {
      const failure = error instanceof AppError ? error : new AppError(502, 'REPORT_SIGNING_FAILED')
      await this.issuance.fail(claim, failure.code)
      throw failure
    }

    const { discard, ...metadata } = stored
    let completed
    try {
      completed = await this.issuance.complete(claim, code, metadata)
    } catch {
      // A database transport error can leave commit outcome unknown. Keep the bytes in that case.
      const current = await this.issuance.fail(claim, 'REPORT_PUBLICATION_FAILED')
        .then(() => this.reports.find(laboratory.id, reportId))
        .catch(() => null)
      if (current?.publicCode && verifiedFile(current)) return reportDTO(current)
      if (current?.revision === claim.revision + 1 && current.issuanceFailureCode === 'REPORT_PUBLICATION_FAILED')
        throw new AppError(502, 'REPORT_PUBLICATION_FAILED')
      throw new AppError(503, 'REPORT_PUBLICATION_STATE_UNKNOWN')
    }
    if (!completed) {
      await discard().catch(() => undefined)
      throw new AppError(409, 'ISSUANCE_IN_PROGRESS_OR_CHANGED')
    }
    const issued = await this.reports.find(laboratory.id, reportId)
    if (!issued) throw new AppError(404, 'REPORT_NOT_FOUND')
    return reportDTO(issued)
  }
}
