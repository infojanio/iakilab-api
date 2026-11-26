import { PrismaServiceOrderRepository } from '../../repositories/prisma/prisma-service-order-repository.js'
import { join } from 'node:path'
import { A1CredentialStore } from '../../lib/a1-credential-store.js'
import type { Config } from '../../config.js'
import { PrismaReportIssuanceRepository } from '../../repositories/prisma/prisma-report-issuance-repository.js'
import { makeReportIssuanceUseCases } from './make-report-issuance-use-cases.js'
import bcrypt from 'bcryptjs'
import { prisma } from '../../lib/prisma.js'
import { PrismaAuthRepository } from '../../repositories/prisma/prisma-auth-repository.js'
import { PrismaReportsRepository } from '../../repositories/prisma/prisma-reports-repository.js'
import { AuthService } from '../auth/auth-service.js'
import { ReadReports } from '../reports/read-reports.js'
import { LocalPdfStorage } from '../../lib/pdf-storage.js'

import { PrismaLaboratoryRepository } from '../../repositories/prisma/prisma-laboratory-repository.js'
import { PrismaPlatformRepository } from '../../repositories/prisma/prisma-platform-repository.js'
import { makePlatformUseCases } from './make-platform-use-cases.js'
import { makeLaboratoryUseCases } from './make-laboratory-use-cases.js'
const { hash } = bcrypt

export async function makeServices(config: Config) {
  const auth = new AuthService(
    new PrismaAuthRepository(prisma),
    await hash('dummy-password-never-used-to-login', 12),
  )
  const reports = new PrismaReportsRepository(prisma)
  const storage = new LocalPdfStorage(config.storageRoot)
  const a1 = config.a1Management
  const credentials = a1 && new A1CredentialStore(join(config.storageRoot, '.a1'), a1.key, a1.python, a1.publicOrigin)
  return {
    auth,
    reports: new ReadReports(reports),
    storage,
    issuance: makeReportIssuanceUseCases(auth, reports, new PrismaReportIssuanceRepository(prisma), storage, config.a1ByLaboratory, config.a1ConfigurationInvalid, credentials, config.reportRectificationEnabled),
    platform: makePlatformUseCases(new PrismaPlatformRepository(prisma)),
    laboratory: makeLaboratoryUseCases(
      auth,
      new PrismaLaboratoryRepository(prisma),
      reports,
      storage,
      new PrismaServiceOrderRepository(prisma),
    ),
  }
}
