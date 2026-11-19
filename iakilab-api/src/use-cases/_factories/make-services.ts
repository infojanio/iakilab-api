import bcrypt from 'bcryptjs'
import {prisma} from '../../lib/prisma.js'
import {PrismaAuthRepository} from '../../repositories/prisma/prisma-auth-repository.js'
import {PrismaReportsRepository} from '../../repositories/prisma/prisma-reports-repository.js'
import {AuthService} from '../auth/auth-service.js'
import {ReadReports} from '../reports/read-reports.js'
import {LocalPdfStorage} from '../../lib/pdf-storage.js'

import { PrismaLaboratoryRepository } from '../../repositories/prisma/prisma-laboratory-repository.js'
import { PrismaPlatformRepository } from '../../repositories/prisma/prisma-platform-repository.js'
import { ReadPlatform } from '../platform/read-platform.js'
import { ManageLaboratory } from '../laboratory/manage-laboratory.js'
const { hash } = bcrypt

export async function makeServices(storageRoot: string) {
  const auth = new AuthService(new PrismaAuthRepository(prisma), await hash('dummy-password-never-used-to-login', 12))
  const reports = new PrismaReportsRepository(prisma)
  const storage = new LocalPdfStorage(storageRoot)
  return {
    auth,
    reports: new ReadReports(reports),
    storage,
    platform: new ReadPlatform(new PrismaPlatformRepository(prisma)),
    laboratory: new ManageLaboratory(auth, new PrismaLaboratoryRepository(prisma), reports, storage),
  }
}
