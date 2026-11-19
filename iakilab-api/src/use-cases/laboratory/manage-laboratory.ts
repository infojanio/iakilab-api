import type { LocalPdfStorage } from '../../lib/pdf-storage.js'
import { AppError, type Actor } from '../../domain.js'
import type { AuthService } from '../auth/auth-service.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { ClientData, SampleData, DraftData, DraftTransition, LaboratoryRepository } from '../../repositories/laboratory-repository.js'

type Scope = { actor: Actor; laboratoryId?: string }
type Transition = 'edit' | 'submit' | 'validate' | 'return'

const transitions = {
  edit: { from: 'DRAFT', to: 'DRAFT', action: 'EDITED' },
  submit: { from: 'DRAFT', to: 'AWAITING_VALIDATION', action: 'SUBMITTED' },
  validate: { from: 'AWAITING_VALIDATION', to: 'VALIDATED', action: 'VALIDATED' },
  return: { from: 'AWAITING_VALIDATION', to: 'DRAFT', action: 'RETURNED' },
} as const satisfies Record<Transition, Pick<DraftTransition, 'from' | 'to' | 'action'>>

function requireRecord<T>(record: T | null): T {
  if (!record) throw new AppError(404, 'RECORD_NOT_FOUND')
  return record
}

export class ManageLaboratory {
  constructor(private auth: AuthService, private repository: LaboratoryRepository, private reports: ReportsRepository, private storage: LocalPdfStorage) {}

  private tenant(scope: Scope) {
    return this.auth.tenant(scope.actor, scope.laboratoryId)
  }
  private requireAdmin(scope: Scope) {
    if (scope.actor.role === 'ANALISTA') throw new AppError(403, 'ROLE_NOT_ALLOWED')
  }

  async listClients(scope: Scope) { return this.repository.listClients(await this.tenant(scope)) }
  async client(scope: Scope, id: string) { return requireRecord(await this.repository.client(await this.tenant(scope), id)) }
  async createClient(scope: Scope, data: ClientData) {
    this.requireAdmin(scope)
    return this.repository.createClient(await this.tenant(scope), data)
  }
  async updateClient(scope: Scope, id: string, data: Partial<ClientData>) {
    this.requireAdmin(scope)
    return requireRecord(await this.repository.updateClient(await this.tenant(scope), id, data))
  }
  async archiveClient(scope: Scope, id: string) {
    this.requireAdmin(scope)
    requireRecord(await this.repository.updateClient(await this.tenant(scope), id, { active: false }))
  }
  async listSamples(scope: Scope) { return this.repository.listSamples(await this.tenant(scope)) }
  async sample(scope: Scope, id: string) { return requireRecord(await this.repository.sample(await this.tenant(scope), id)) }
  async createSample(scope: Scope, data: SampleData) { return this.repository.createSample(await this.tenant(scope), data) }
  async updateSample(scope: Scope, id: string, data: Partial<SampleData>) {
    return requireRecord(await this.repository.updateSample(await this.tenant(scope), id, data))
  }
  async archiveSample(scope: Scope, id: string) {
    this.requireAdmin(scope)
    requireRecord(await this.repository.updateSample(await this.tenant(scope), id, { active: false }))
  }
  async metrics(scope: Scope) { return this.repository.metrics(await this.tenant(scope)) }
  async createDraft(scope: Scope, draft: DraftData) { return this.repository.createDraft(await this.tenant(scope), scope.actor.user.id, draft) }
  async importPdf(scope: Scope, data: Pick<DraftData, 'identification' | 'customerName'> & { notes: string }, bytes: Buffer) {
    const laboratoryId = await this.tenant(scope)
    const { discard, ...file } = await this.storage.saveOriginal(laboratoryId, bytes)
    try {
      return await this.repository.createDraft(laboratoryId, scope.actor.user.id, { identification: data.identification, customerName: data.customerName, kind: 'PDF_UPLOAD', draftData: data }, file)
    } catch (error) {
      await discard().catch(() => undefined)
      throw error
    }
  }
  async transition(scope: Scope, id: string, revision: number, action: Transition, draft?: DraftData) {
    if (action === 'validate' || action === 'return') this.requireAdmin(scope)
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
