import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppError } from '../domain.js'
import { PdfA1 } from './pdf-a1.js'
import { withProcessingWorkspace } from './processing-workspace.js'

export type A1Material = { certificate: string; password: string; trustRoot: string; intermediateChain?: string }

export class A1CredentialStore {
  constructor(private directory: string, private key: Buffer, private python: string, readonly publicOrigin: string) {}

  async load(laboratoryId: string): Promise<A1Material | undefined> {
    let sealed: Buffer
    try {
      sealed = await readFile(join(this.directory, laboratoryId + '.a1'))
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined
      throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.key, sealed.subarray(0, 12))
      decipher.setAAD(Buffer.from(laboratoryId))
      decipher.setAuthTag(sealed.subarray(12, 28))
      return JSON.parse(Buffer.concat([decipher.update(sealed.subarray(28)), decipher.final()]).toString())
    } catch {
      throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
    }
  }

  async save(laboratoryId: string, material: A1Material) {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', this.key, iv)
    cipher.setAAD(Buffer.from(laboratoryId))
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(material)), cipher.final()])
    await mkdir(this.directory, { recursive: true, mode: 0o700 })
    const temporary = join(this.directory, randomUUID() + '.tmp')
    try {
      await writeFile(temporary, Buffer.concat([iv, cipher.getAuthTag(), ciphertext]), { flag: 'wx', mode: 0o600 })
      await rename(temporary, join(this.directory, laboratoryId + '.a1'))
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }

  withSigner<T>(material: A1Material, operation: (signer: PdfA1) => Promise<T>) {
    return withProcessingWorkspace(async directory => {
      const certificate = join(directory, 'certificate.p12')
      const passwordFile = join(directory, 'password')
      const trustRoot = join(directory, 'root')
      const intermediateChain = material.intermediateChain ? join(directory, 'intermediates') : undefined
      const files = [[certificate, material.certificate], [passwordFile, material.password], [trustRoot, material.trustRoot]]
      if (intermediateChain && material.intermediateChain) files.push([intermediateChain, material.intermediateChain])
      await Promise.all(files.map(([path, data]) => writeFile(path, Buffer.from(data, 'base64'), { mode: 0o600 })))
      return operation(new PdfA1({ python: this.python, certificate, passwordFile, trustRoot, intermediateChain }))
    })
  }
}
