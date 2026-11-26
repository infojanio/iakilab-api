import { AppError } from '../../domain.js'
import type { ReportIssuanceRepository } from '../../repositories/report-issuance-repository.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { AuthService } from '../auth/auth-service.js'
import { requireLaboratoryAdmin, requireRecord, type Scope } from '../laboratory/scope.js'
import { reportDTO, verifiedFile } from './read-reports.js'

export class RectifyReport {
  constructor(
    private auth: AuthService,
    private reports: Pick<ReportsRepository, 'find'>,
    private repository: Pick<ReportIssuanceRepository, 'series' | 'createRectification' | 'issuerNames'>,
    private enabled: boolean,
  ) {}

  async start(scope: Scope, id: string, reason: string) {
    requireLaboratoryAdmin(scope)
    const laboratoryId = await this.auth.tenant(scope.actor, scope.laboratoryId)
    const report = requireRecord(await this.reports.find(laboratoryId, id))
    if (!this.enabled) throw new AppError(403, 'RECTIFICATION_DISABLED')
    if (!report.publicCode || !verifiedFile(report))
      throw new AppError(409, 'RECTIFICATION_REQUIRES_ISSUED_REPORT')
    const rows = await this.repository.series(laboratoryId, report.rectificationRootId ?? report.id)
    const root = requireRecord(rows[0] ?? null)
    if (rows.at(-1)?.id !== id) throw new AppError(409, 'RECTIFICATION_ALREADY_EXISTS')
    const actor = { id: scope.actor.user.id, name: scope.actor.user.name }
    const next = await this.repository.createRectification(report, root.identification, reason, actor)
    return reportDTO({ ...next, versions: [] })
  }

  async history(scope: Scope, id: string) {
    const laboratoryId = await this.auth.tenant(scope.actor, scope.laboratoryId)
    const report = requireRecord(await this.reports.find(laboratoryId, id))
    const rows = await this.repository.series(laboratoryId, report.rectificationRootId ?? report.id)
    const current = [...rows].reverse().find(row => Boolean(row.publicCode && verifiedFile(row)))
    const issuerIds = rows.flatMap(row => row.stage === 'ISSUED' && row.versions[0]?.issuedBy ? [row.versions[0].issuedBy] : [])
    const issuers = new Map((await this.repository.issuerNames(issuerIds)).map(actor => [actor.id, actor.name]))
    return {
      canStart: this.enabled && scope.actor.role !== 'ANALISTA' && current?.id === id && rows.at(-1)?.id === id,
      versions: rows.map(row => ({
        id: row.id,
        identification: row.identification,
        number: row.rectificationNumber + 1,
        previousId: row.rectifiesId,
        reason: row.rectificationReason,
        actorId: row.rectificationActorId,
        actorName: row.rectificationActorName,
        createdAt: row.createdAt,
        issuedAt: row.stage === 'ISSUED' ? row.versions[0]?.issuedAt : undefined,
        issuerName: row.stage === 'ISSUED' ? issuers.get(row.versions[0]?.issuedBy ?? '') : undefined,
        status: row.issuanceFailedAt ? 'ISSUANCE_FAILED' :
          row.stage === 'ISSUED' && current?.id !== row.id ? 'SUPERSEDED' : row.stage,
        current: current?.id === row.id,
      })),
    }
  }
}
