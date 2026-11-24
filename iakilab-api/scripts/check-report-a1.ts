import { join } from 'node:path'
import { A1CredentialStore } from '../src/lib/a1-credential-store.js'
import { AppError } from '../src/domain.js'
import { PDFDocument } from 'pdf-lib'
import { z } from 'zod'
import { loadConfig } from '../src/config.js'
import { PdfA1 } from '../src/lib/pdf-a1.js'
import { prisma } from '../src/lib/prisma.js'

const id = z.string().uuid().safeParse(process.argv[2])
let check = 'UUID do laboratório'
try {
  if (!id.success) throw new Error('Informe o UUID do laboratório.')
  const laboratoryId = id.data.toLowerCase()

  check = 'configuração A1'
  const config = loadConfig({ tolerateInvalidA1: true })
  const management = config.a1Management
  const store = management && new A1CredentialStore(join(config.storageRoot, '.a1'), management.key, management.python, management.publicOrigin)
  const material = await store?.load(laboratoryId)
  const credentials = config.a1ByLaboratory?.get(laboratoryId)
  if (!material && config.a1ConfigurationInvalid) throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
  if (!material && !credentials) throw new Error('LABORATORY_SIGNER_UNAVAILABLE')

  check = 'vínculo com o laboratório no banco'
  const laboratory = await prisma.laboratory.findUnique({
    where: { id: laboratoryId },
    select: { id: true, name: true },
  })
  if (!laboratory) throw new Error('LABORATORY_NOT_FOUND')
  console.log('Laboratório confirmado', laboratory.id, laboratory.name)

  async function checkSigner(signer: PdfA1) {
    check = 'validade do A1'
    console.log(JSON.stringify(await signer.inspect()))
    check = 'assinatura e cadeia de confiança'
    const pdf = await PDFDocument.create()
    pdf.addPage().drawText('Teste local de assinatura A1 do IAkiLab')
    await signer.signAndVerify(Buffer.from(await pdf.save()))
  }
  if (store && material) await store.withSigner(material, checkSigner)
  else if (credentials) await checkSigner(new PdfA1(credentials))
  console.log('A1 verificado em PDF temporário para o laboratório', laboratory.id)
} catch (error) {
  console.error('Falha em', check)
  if (error instanceof Error) {
    if (error instanceof AppError) console.error(error.code)
    else if (['UUID do laboratório', 'configuração A1'].includes(check) || error.message === 'LABORATORY_NOT_FOUND')
      console.error(error.message)
    else if ('errorCode' in error) console.error(error.errorCode)
  }
  process.exitCode = 1
} finally {
  await prisma.$disconnect()
}
