import type { AuthService } from '../auth/auth-service.js'
import { AppError } from '../../domain.js'
import type {
  InspectionData,
  SampleData,
  SampleWorkflow,
  LaboratoryRepository,
} from '../../repositories/laboratory-repository.js'
import {
  requireLaboratoryAdmin,
  requireRecord,
  type Scope,
} from '../laboratory/scope.js'

export class ManageSamples {
  constructor(
    private auth: AuthService,
    private repository: Pick<
      LaboratoryRepository,
      'listSamples' | 'sample' | 'sampleLabels' | 'createSample' | 'updateSample' | 'advanceSample'
    >,
  ) {}

  private tenant(scope: Scope) {
    return this.auth.tenant(scope.actor, scope.laboratoryId)
  }

  async listSamples(scope: Scope) {
    return this.repository.listSamples(await this.tenant(scope))
  }

  async sample(scope: Scope, id: string) {
    return requireRecord(
      await this.repository.sample(await this.tenant(scope), id),
    )
  }

  async labels(scope: Scope, ids: string[]) {
    const labels = await this.repository.sampleLabels(await this.tenant(scope), ids)
    const byId = new Map(labels.map(label => [label.id, label]))
    return ids.map(id => requireRecord(byId.get(id) ?? null))
  }

  async createSample(scope: Scope, data: SampleData) {
    const laboratoryId = await this.tenant(scope)
    if (!['Aguardando recebimento', 'Recebida'].includes(data.status))
      throw new AppError(409, 'SAMPLE_STATUS_WORKFLOW_REQUIRED')
    return this.repository.createSample(laboratoryId, data)
  }

  async updateSample(scope: Scope, id: string, data: Partial<SampleData>) {
    const laboratoryId = await this.tenant(scope)
    const { status, ...fields } = data
    const current = requireRecord(await this.repository.sample(laboratoryId, id))
    if (status !== undefined && status !== current.status)
      throw new AppError(409, 'SAMPLE_STATUS_WORKFLOW_REQUIRED')
    if (!Object.keys(fields).length) return current
    return requireRecord(await this.repository.updateSample(laboratoryId, id, fields))
  }

  async receive(scope: Scope, id: string, inspection: InspectionData) {
    return this.advance(scope, id, {
      action: 'receive', inspection, userId: scope.actor.user.id, userName: scope.actor.user.name,
    })
  }

  async startAnalysis(scope: Scope, id: string) {
    return this.advance(scope, id, { action: 'start' })
  }

  async saveAnalysisResult(scope: Scope, id: string, result: string) {
    return this.advance(scope, id, { action: 'result', result })
  }

  private async advance(scope: Scope, id: string, change: SampleWorkflow) {
    const laboratoryId = await this.tenant(scope)
    const current = requireRecord(await this.repository.sample(laboratoryId, id))
    if (change.action !== 'receive') {
      if (current.inspectionDecision === 'REJECTED') throw new AppError(409, 'SAMPLE_REJECTED')
      if (!current.inspectionDecision) throw new AppError(409, 'SAMPLE_INSPECTION_REQUIRED')
    }
    if (!await this.repository.advanceSample(laboratoryId, id, change))
      throw new AppError(409, change.action === 'receive' ? 'SAMPLE_ALREADY_INSPECTED' : 'SAMPLE_ANALYSIS_STATE_CONFLICT')
    return requireRecord(await this.repository.sample(laboratoryId, id))
  }

  async archiveSample(scope: Scope, id: string) {
    requireLaboratoryAdmin(scope)
    requireRecord(
      await this.repository.updateSample(await this.tenant(scope), id, {
        active: false,
      }),
    )
  }
}
