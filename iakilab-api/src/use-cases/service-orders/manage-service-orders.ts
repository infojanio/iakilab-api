import { AppError } from '../../domain.js'
import type { LaboratoryRepository } from '../../repositories/laboratory-repository.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { ServiceOrderRepository } from '../../repositories/service-order-repository.js'
import type { AuthService } from '../auth/auth-service.js'
import { requireRecord, type Scope } from '../laboratory/scope.js'

export class ManageServiceOrders {
  constructor(
    private auth: AuthService,
    private repository: ServiceOrderRepository,
    private samples: Pick<LaboratoryRepository, 'sample'>,
    private reports: Pick<ReportsRepository, 'find'>,
  ) {}

  private tenant(scope: Scope) {
    return this.auth.tenant(scope.actor, scope.laboratoryId)
  }

  async list(scope: Scope) {
    return this.repository.listOrders(await this.tenant(scope))
  }

  async create(scope: Scope, number: string) {
    return this.repository.createOrder(await this.tenant(scope), number)
  }

  async detail(scope: Scope, id: string) {
    return this.detailFor(await this.tenant(scope), id)
  }

  private async detailFor(laboratoryId: string, id: string) {
    const order = requireRecord(await this.repository.order(laboratoryId, id))
    const active = order.samples.filter(sample => sample.active)
    const pending = {
      reception: active.filter(sample => sample.inspectionDecision === null).map(sample => sample.id),
      analysis: active.filter(sample =>
        (sample.inspectionDecision === 'ACCEPTED' || sample.inspectionDecision === 'ACCEPTED_WITH_RESERVATION') &&
        sample.analysisResult === null,
      ).map(sample => sample.id),
      recollection: active.filter(sample => sample.inspectionDecision === 'REJECTED').map(sample => sample.id),
      review: order.reports.filter(report => report.stage === 'AWAITING_VALIDATION').map(report => report.id),
    }
    return { ...order, pending }
  }

  async completeVisit(scope: Scope, id: string) {
    const laboratoryId = await this.tenant(scope)
    requireRecord(await this.repository.order(laboratoryId, id))
    await this.repository.completeVisit(laboratoryId, id)
    return this.detailFor(laboratoryId, id)
  }

  async attach(scope: Scope, orderId: string, kind: 'sample' | 'report', recordId: string) {
    const laboratoryId = await this.tenant(scope)
    requireRecord(await this.repository.order(laboratoryId, orderId))
    let attached
    if (kind === 'sample') {
      requireRecord(await this.samples.sample(laboratoryId, recordId))
      attached = await this.repository.attachSample(laboratoryId, orderId, recordId)
    } else {
      requireRecord(await this.reports.find(laboratoryId, recordId))
      attached = await this.repository.attachReport(laboratoryId, orderId, recordId)
    }
    if (!attached) throw new AppError(409, 'SERVICE_ORDER_LINK_CONFLICT')
    return this.detailFor(laboratoryId, orderId)
  }
}
