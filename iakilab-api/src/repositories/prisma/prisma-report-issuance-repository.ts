import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import type { IssuanceClaim, ReportIssuanceRepository, StoredPdf } from '../report-issuance-repository.js'

function candidate({ laboratoryId, reportId, revision }: IssuanceClaim) {
  return { id: reportId, laboratoryId, revision, stage: 'VALIDATED' as const }
}

export class PrismaReportIssuanceRepository implements ReportIssuanceRepository {
  constructor(private db: PrismaClient) {}

  async claim(claim: IssuanceClaim, now: Date, expiredBefore: Date) {
    const updated = await this.db.report.updateMany({
      where: { ...candidate(claim), OR: [{ issuanceAttempt: null }, { issuanceStartedAt: { lt: expiredBefore } }] },
      data: { issuanceAttempt: claim.attempt, issuanceStartedAt: now, issuanceFailedAt: null },
    })
    return updated.count === 1
  }

  async complete(claim: IssuanceClaim, code: string, file: StoredPdf) {
    return this.db.$transaction(async tx => {
      const now = new Date()
      const updated = await tx.report.updateMany({
        where: { ...candidate(claim), issuanceAttempt: claim.attempt },
        data: {
          stage: 'ISSUED', revision: { increment: 1 }, publicCode: code,
          issuanceAttempt: null, issuanceStartedAt: null, issuanceFailedAt: null,
        },
      })
      if (updated.count === 0) return false

      const { laboratoryId, reportId, actorId } = claim
      const report = await tx.report.findUniqueOrThrow({ where: { laboratoryId_id: { laboratoryId, id: reportId } } })
      const previous = await tx.reportVersion.findFirst({
        where: { laboratoryId, reportId },
        orderBy: { number: 'desc' },
      })
      const validation = await tx.reportEvent.findFirst({
        where: { laboratoryId, reportId, action: 'VALIDATED' },
        orderBy: { revision: 'desc' },
      })
      const version = await tx.reportVersion.create({
        data: {
          laboratoryId, reportId, number: (previous?.number ?? 0) + 1, snapshot: report.draftData ?? Prisma.JsonNull,
          validatedAt: validation?.createdAt, validatedBy: validation?.actorId,
          issuedAt: now, issuedBy: actorId, signatureStatus: 'VERIFIED',
          signatureVerifiedAt: now, signedSha256: file.sha256,
        },
      })
      await tx.reportFile.create({ data: { ...file, laboratoryId, versionId: version.id, kind: 'SIGNED' } })
      await tx.reportEvent.create({ data: { laboratoryId, reportId, actorId, revision: report.revision, action: 'ISSUED' } })
      return true
    })
  }

  async fail(claim: IssuanceClaim) {
    await this.db.$transaction(async tx => {
      const updated = await tx.report.updateMany({
        where: { ...candidate(claim), issuanceAttempt: claim.attempt },
        data: { issuanceAttempt: null, issuanceStartedAt: null, issuanceFailedAt: new Date(), revision: { increment: 1 } },
      })
      if (updated.count === 1) {
        await tx.reportEvent.create({ data: {
          laboratoryId: claim.laboratoryId, reportId: claim.reportId, actorId: claim.actorId,
          revision: claim.revision + 1, action: 'ISSUANCE_FAILED',
        } })
      }
    })
  }

  findPublished(code: string) {
    return this.findPublic({ OR: [{ publicCode: code }, { legacyPublicId: code }] })
  }

  findPublishedByFilename(filename: string) {
    return this.findPublic({ legacyPdfFilename: filename })
  }

  private findPublic(filter: Prisma.ReportWhereInput) {
    return this.db.report.findFirst({
      where: {
        ...filter,
        stage: 'ISSUED', publicCode: { not: null }, laboratory: { active: true },
      },
      include: { versions: { orderBy: { number: 'desc' }, take: 1, include: { files: true } } },
    })
  }
}
