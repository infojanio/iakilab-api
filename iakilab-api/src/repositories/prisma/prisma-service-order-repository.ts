import type { PrismaClient } from '@prisma/client'
import type { ServiceOrderRepository } from '../service-order-repository.js'

export class PrismaServiceOrderRepository implements ServiceOrderRepository {
  constructor(private db: PrismaClient) {}

  listOrders(laboratoryId: string) {
    return this.db.serviceOrder.findMany({ where: { laboratoryId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] })
  }

  order(laboratoryId: string, id: string) {
    return this.db.serviceOrder.findUnique({
      where: { laboratoryId_id: { laboratoryId, id } },
      include: {
        samples: { orderBy: { identification: 'asc' } },
        reports: { select: { id: true, identification: true, stage: true }, orderBy: { identification: 'asc' } },
      },
    })
  }

  createOrder(laboratoryId: string, number: string) {
    return this.db.serviceOrder.create({ data: { laboratoryId, number } })
  }

  async completeVisit(laboratoryId: string, id: string) {
    await this.db.serviceOrder.updateMany({
      where: { laboratoryId, id, visitCompletedAt: null },
      data: { visitCompletedAt: new Date() },
    })
  }

  async attachSample(laboratoryId: string, orderId: string, id: string) {
    const result = await this.db.sample.updateMany({
      where: { laboratoryId, id, active: true, OR: [{ serviceOrderId: null }, { serviceOrderId: orderId }] },
      data: { serviceOrderId: orderId },
    })
    return result.count === 1
  }

  async attachReport(laboratoryId: string, orderId: string, id: string) {
    const result = await this.db.report.updateMany({
      where: { laboratoryId, id, OR: [{ serviceOrderId: null }, { serviceOrderId: orderId }] },
      data: { serviceOrderId: orderId },
    })
    return result.count === 1
  }
}
