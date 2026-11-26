import type { Report, Sample, ServiceOrder } from '@prisma/client'

export type ServiceOrderDetail = ServiceOrder & {
  samples: Sample[]
  reports: Pick<Report, 'id' | 'identification' | 'stage'>[]
}

export interface ServiceOrderRepository {
  listOrders(laboratoryId: string): Promise<ServiceOrder[]>
  order(laboratoryId: string, id: string): Promise<ServiceOrderDetail | null>
  createOrder(laboratoryId: string, number: string): Promise<ServiceOrder>
  completeVisit(laboratoryId: string, id: string): Promise<void>
  attachSample(laboratoryId: string, orderId: string, sampleId: string): Promise<boolean>
  attachReport(laboratoryId: string, orderId: string, reportId: string): Promise<boolean>
}
