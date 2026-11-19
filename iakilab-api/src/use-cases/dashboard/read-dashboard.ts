import type { AuthService } from '../auth/auth-service.js'
import type { LaboratoryRepository } from '../../repositories/laboratory-repository.js'
import { type Scope } from '../laboratory/scope.js'

export class ReadDashboard {
  constructor(
    private auth: AuthService,
    private repository: Pick<LaboratoryRepository, 'metrics'>,
  ) {}

  private tenant(scope: Scope) {
    return this.auth.tenant(scope.actor, scope.laboratoryId)
  }

  async metrics(scope: Scope) {
    return this.repository.metrics(await this.tenant(scope))
  }
}
