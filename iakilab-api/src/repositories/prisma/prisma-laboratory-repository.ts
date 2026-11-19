import { Prisma, type PrismaClient, type ReportStage } from '@prisma/client'
import type { ClientData, SampleData, DraftData, DraftTransition, LaboratoryRepository, OriginalPdf } from '../laboratory-repository.js'

export class PrismaLaboratoryRepository implements LaboratoryRepository {
  constructor(private db: PrismaClient) {}

  listClients(laboratoryId: string) {
    return this.db.client.findMany({ where: { laboratoryId, active: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] })
  }
  client(laboratoryId: string, id: string) {
    return this.db.client.findFirst({ where: { laboratoryId, id, active: true } })
  }
  createClient(laboratoryId: string, data: ClientData) {
    return this.db.client.create({ data: { ...data, laboratoryId } })
  }
  async updateClient(laboratoryId: string, id: string, data: Partial<ClientData> & { active?: boolean }) {
    try {
      return await this.db.client.update({ where: { laboratoryId_id: { laboratoryId, id }, active: true }, data })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null
      throw error
    }
  }
  listSamples(laboratoryId: string) {
    return this.db.sample.findMany({ where: { laboratoryId, active: true }, orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }] })
  }
  sample(laboratoryId: string, id: string) {
    return this.db.sample.findFirst({ where: { laboratoryId, id, active: true } })
  }
  createSample(laboratoryId: string, data: SampleData) {
    return this.db.sample.create({ data: { ...data, laboratoryId } })
  }
  async updateSample(laboratoryId: string, id: string, data: Partial<SampleData> & { active?: boolean }) {
    try {
      return await this.db.sample.update({ where: { laboratoryId_id: { laboratoryId, id }, active: true }, data })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null
      throw error
    }
  }
  createDraft(laboratoryId: string, actorId: string, data: DraftData, original?: OriginalPdf) {
    return this.db.$transaction(async db => {
      const report = await db.report.create({ data: { ...data, laboratoryId, events: { create: { actorId, revision: 1, action: 'CREATED' } } } })
      if (original) {
        const version = await db.reportVersion.create({
          data: { laboratoryId, reportId: report.id, number: 1, snapshot: data.draftData },
        })
        await db.reportFile.create({ data: { ...original, laboratoryId, versionId: version.id, kind: 'ORIGINAL' } })
      }
      return report
    })
  }
  async transition(laboratoryId: string, id: string, change: DraftTransition) {
    return this.db.$transaction(async db => {
      const updated = await db.report.updateMany({
        where: { id, laboratoryId, stage: change.from, revision: change.revision },
        data: { ...change.draft, stage: change.to, revision: { increment: 1 } },
      })
      if (updated.count === 0) return null
      const report = await db.report.findUniqueOrThrow({ where: { laboratoryId_id: { laboratoryId, id } } })
      await db.reportEvent.create({ data: { laboratoryId, reportId: id, actorId: change.actorId, action: change.action, revision: report.revision } })
      return report
    })
  }
  async metrics(laboratoryId: string) {
    const [groups, clients, samples] = await this.db.$transaction([
      this.db.$queryRaw<{ stage: ReportStage; count: bigint }[]>`SELECT stage, COUNT(*) AS count FROM "Report" WHERE "laboratoryId" = ${laboratoryId}::uuid GROUP BY stage ORDER BY stage`,
      this.db.client.count({ where: { laboratoryId, active: true } }),
      this.db.sample.count({ where: { laboratoryId, active: true } }),
    ], { isolationLevel: 'RepeatableRead' })
    const byStage = groups.map(g => ({ stage: g.stage, count: Number(g.count) }))
    return { total: byStage.reduce((sum, row) => sum + row.count, 0), clients, samples, byStage }
  }
}
