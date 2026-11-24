import { PDFDocument } from 'pdf-lib'
import { hasPdfSignature } from '../../lib/pdf-signature-fields.js'
import type {AuthService} from '../auth/auth-service.js'
import type {DraftData, LaboratoryRepository, DraftTransition} from '../../repositories/laboratory-repository.js'
import {requireLaboratoryAdmin, requireRecord, type Scope} from '../laboratory/scope.js'
import {AppError} from '../../domain.js'
import type {LocalPdfStorage} from '../../lib/pdf-storage.js'
import type {ReportsRepository} from '../../repositories/reports-repository.js'

type Transition = 'edit' | 'submit' | 'validate' | 'return'

const transitions = {
  edit: { from: 'DRAFT', to: 'DRAFT', action: 'EDITED' },
  submit: { from: 'DRAFT', to: 'AWAITING_VALIDATION', action: 'SUBMITTED' },
  validate: { from: 'AWAITING_VALIDATION', to: 'VALIDATED', action: 'VALIDATED' },
  return: { from: 'AWAITING_VALIDATION', to: 'DRAFT', action: 'RETURNED' },
} as const satisfies Record<Transition, Pick<DraftTransition, 'from' | 'to' | 'action'>>

export class ManageReportDrafts {
  constructor(
    private auth: AuthService,
    private repository: Pick<LaboratoryRepository, 'createDraft' | 'transition'>,
    private reports: ReportsRepository, private storage: LocalPdfStorage
  ) {}

  private tenant(scope: Scope) {
    return this.auth.tenant(scope.actor, scope.laboratoryId)
  }

  async createDraft(scope: Scope, draft: DraftData) { return this.repository.createDraft(await this.tenant(scope), scope.actor.user.id, draft) }

  async importPdf(scope: Scope, data: Pick<DraftData, 'identification' | 'customerName'> & { notes: string }, bytes: Buffer) {
    const laboratoryId = await this.tenant(scope)
    const signed = await PDFDocument.load(bytes)
      .then(hasPdfSignature)
      .catch(() => { throw new AppError(422, 'INVALID_PDF') })
    if (signed) throw new AppError(422, 'ALREADY_SIGNED_ORIGINAL')
    const { discard, ...file } = await this.storage.saveOriginal(laboratoryId, bytes)
    try {
      return await this.repository.createDraft(laboratoryId, scope.actor.user.id, { identification: data.identification, customerName: data.customerName, kind: 'PDF_UPLOAD', draftData: data }, file)
    } catch (error) {
      await discard().catch(() => undefined)
      throw error
    }
  }

  async transition(scope: Scope, id: string, revision: number, action: Transition, draft?: DraftData) {
    if (action === 'validate' || action === 'return') requireLaboratoryAdmin(scope)
    const laboratoryId = await this.tenant(scope)
    const current = requireRecord(await this.reports.find(laboratoryId, id))
    const transition = transitions[action]
    if (current.stage !== transition.from || current.revision !== revision) throw new AppError(409, 'REPORT_REVISION_OR_STAGE_CONFLICT')
    if (draft && current.kind !== draft.kind) throw new AppError(409, 'REPORT_KIND_IMMUTABLE')
    if (action === 'submit' && current.kind !== 'PDF_UPLOAD') this.checkResults(current.kind, current.draftData)
    if (action === 'submit' && current.kind === 'PDF_UPLOAD' && !current.versions[0]?.files.some(file => file.kind === 'ORIGINAL'))
      throw new AppError(422, 'ORIGINAL_PDF_REQUIRED')
    const changed = await this.repository.transition(laboratoryId, id, { ...transition, revision, actorId: scope.actor.user.id, draft })
    if (!changed) throw new AppError(409, 'REPORT_REVISION_OR_STAGE_CONFLICT')
    return changed
  }

  private checkResults(kind: string, data: unknown) {
    const snapshot = data as { waterResults?: { result?: string }[]; soilSamples?: { results?: Record<string, string> }[] }
    const waterReady = kind === 'WATER' && snapshot.waterResults?.some(row => row.result?.trim())
    const soilReady = kind === 'SOIL' && snapshot.soilSamples?.some(row => Object.values(row.results ?? {}).some(value => value.trim()))
    if (!waterReady && !soilReady) throw new AppError(422, 'REPORT_RESULTS_REQUIRED')
  }
}
