import { randomUUID } from 'node:crypto'
import { AppError } from '../../domain.js'
import type { ReportRecord } from '../reports-repository.js'
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
      data: { issuanceAttempt: claim.attempt, issuanceStartedAt: now, issuanceFailedAt: null, issuanceFailureCode: null },
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
          issuanceAttempt: null, issuanceStartedAt: null, issuanceFailedAt: null, issuanceFailureCode: null,
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

  async fail(claim: IssuanceClaim, code: string) {
    await this.db.$transaction(async tx => {
      const updated = await tx.report.updateMany({
        where: { ...candidate(claim), issuanceAttempt: claim.attempt },
        data: { issuanceAttempt: null, issuanceStartedAt: null, issuanceFailedAt: new Date(), issuanceFailureCode: code, revision: { increment: 1 } },
      })
      if (updated.count === 1) {
        await tx.reportEvent.create({ data: {
          laboratoryId: claim.laboratoryId, reportId: claim.reportId, actorId: claim.actorId,
          revision: claim.revision + 1, action: 'ISSUANCE_FAILED',
        } })
      }
    })
  }

  issuerNames(ids: string[]) {
    return this.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
  }

  series(laboratoryId: string, rootId: string, publishedOnly = false) {
    return this.db.report.findMany({
      where: {
        laboratoryId, OR: [{ id: rootId }, { rectificationRootId: rootId }],
        ...(publishedOnly && { stage: 'ISSUED', publicCode: { not: null }, laboratory: { active: true } }),
      },
      orderBy: { rectificationNumber: 'asc' },
      include: { versions: { orderBy: { number: 'desc' }, take: 1, include: { files: true } } },
    })
  }

  async createRectification(report: ReportRecord, rootIdentification: string, reason: string, actor: { id: string; name: string }) {
    const number = report.rectificationNumber + 1
    const snapshot = report.versions[0].snapshot
    const suffix = ' - R' + number
    const create = (suffix: string) => {
      const identification = rootIdentification.slice(0, 200 - suffix.length) + suffix
      return this.db.report.create({ data: {
        laboratoryId: report.laboratoryId, identification, kind: report.kind, customerName: report.customerName,
        serviceOrderId: report.serviceOrderId, rectifiesId: report.id,
        draftData: {
          ...(snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot) ? snapshot : {}),
          identification, customerName: report.customerName,
        },
        rectificationRootId: report.rectificationRootId ?? report.id, rectificationNumber: number,
        rectificationReason: reason, rectificationActorId: actor.id, rectificationActorName: actor.name,
        events: { create: { actorId: actor.id, revision: 1, action: 'RECTIFICATION_STARTED' } },
      } })
    }
    const existingChild = () => this.db.report.findFirst({
      where: { laboratoryId: report.laboratoryId, rectifiesId: report.id }, select: { id: true },
    })
    const uniqueConflict = (error: unknown) =>
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    try {
      return await create(suffix)
    } catch (error) {
      if (!uniqueConflict(error)) throw error
      if (await existingChild()) throw new AppError(409, 'RECTIFICATION_ALREADY_EXISTS')
      return create(suffix + ' (' + randomUUID() + ')').catch(async retryError => {
        if (uniqueConflict(retryError) && await existingChild()) throw new AppError(409, 'RECTIFICATION_ALREADY_EXISTS')
        throw retryError
      })
    }
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
