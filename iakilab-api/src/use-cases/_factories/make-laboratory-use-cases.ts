import type { ServiceOrderRepository } from '../../repositories/service-order-repository.js'
import { ManageServiceOrders } from '../service-orders/manage-service-orders.js'
import type { LocalPdfStorage } from '../../lib/pdf-storage.js'
import type { LaboratoryRepository } from '../../repositories/laboratory-repository.js'
import type { ReportsRepository } from '../../repositories/reports-repository.js'
import type { AuthService } from '../auth/auth-service.js'
import { ManageClients } from '../clients/manage-clients.js'
import { ReadDashboard } from '../dashboard/read-dashboard.js'
import { ManageReportDrafts } from '../reports/manage-report-drafts.js'
import { ManageSamples } from '../samples/manage-samples.js'

export function makeLaboratoryUseCases(
  auth: AuthService,
  repository: LaboratoryRepository,
  reports: ReportsRepository,
  storage: LocalPdfStorage,
  orders?: ServiceOrderRepository,
) {
  return {
    orders: orders && new ManageServiceOrders(auth, orders, repository, reports),
    clients: new ManageClients(auth, repository),
    samples: new ManageSamples(auth, repository),
    dashboard: new ReadDashboard(auth, repository),
    drafts: new ManageReportDrafts(auth, repository, reports, storage),
  }
}
