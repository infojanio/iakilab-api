import type { AuthService } from '../auth/auth-service.js'
import type {
  ClientData,
  LaboratoryRepository,
} from '../../repositories/laboratory-repository.js'
import {
  requireLaboratoryAdmin,
  requireRecord,
  type Scope,
} from '../laboratory/scope.js'

export class ManageClients {
  constructor(
    private auth: AuthService,
    private repository: Pick<
      LaboratoryRepository,
      'listClients' | 'client' | 'createClient' | 'updateClient'
    >,
  ) {}

  private tenant(scope: Scope) {
    return this.auth.tenant(scope.actor, scope.laboratoryId)
  }

  async listClients(scope: Scope) {
    return this.repository.listClients(await this.tenant(scope))
  }

  async client(scope: Scope, id: string) {
    return requireRecord(
      await this.repository.client(await this.tenant(scope), id),
    )
  }

  async createClient(scope: Scope, data: ClientData) {
    requireLaboratoryAdmin(scope)
    return this.repository.createClient(await this.tenant(scope), data)
  }

  async updateClient(scope: Scope, id: string, data: Partial<ClientData>) {
    requireLaboratoryAdmin(scope)
    return requireRecord(
      await this.repository.updateClient(await this.tenant(scope), id, data),
    )
  }

  async archiveClient(scope: Scope, id: string) {
    requireLaboratoryAdmin(scope)
    requireRecord(
      await this.repository.updateClient(await this.tenant(scope), id, {
        active: false,
      }),
    )
  }
}
