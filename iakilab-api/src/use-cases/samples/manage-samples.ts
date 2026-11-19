import type { AuthService } from '../auth/auth-service.js'
import type {
  SampleData,
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
      'listSamples' | 'sample' | 'createSample' | 'updateSample'
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

  async createSample(scope: Scope, data: SampleData) {
    return this.repository.createSample(await this.tenant(scope), data)
  }

  async updateSample(scope: Scope, id: string, data: Partial<SampleData>) {
    return requireRecord(
      await this.repository.updateSample(await this.tenant(scope), id, data),
    )
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
