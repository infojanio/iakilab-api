import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { AppError } from '../domain.js'
import { withProcessingWorkspace } from './processing-workspace.js'

const execute = promisify(execFile)
const validitySchema = z.object({
  validFrom: z.iso.datetime({ offset: true }),
  validUntil: z.iso.datetime({ offset: true }),
})
const failureByExitCode: Record<number, [number, string]> = {
  10: [503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION'],
  11: [422, 'A1_CERTIFICATE_EXPIRED'],
  12: [422, 'A1_CERTIFICATE_NOT_YET_VALID'],
  13: [502, 'REPORT_SIGNING_FAILED'],
  14: [502, 'REPORT_SIGNATURE_VERIFICATION_FAILED'],
  15: [422, 'PDF_HAS_NO_SIGNATURE'],
}

export type A1Config = {
  python: string
  certificate: string
  passwordFile: string
  trustRoot: string
  intermediateChain?: string
  laboratoryId: string
  publicOrigin: string
}

export class PdfA1 {
  constructor(private config: Pick<A1Config, 'python' | 'trustRoot' | 'intermediateChain'> & Partial<Pick<A1Config, 'certificate' | 'passwordFile'>>) {}

  async inspect(now = new Date()) {
    let validity
    try {
      const { stdout } = await this.run('inspect', '-', this.credentialArguments())
      validity = validitySchema.parse(JSON.parse(stdout))
    } catch {
      throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
    }
    const remaining = Date.parse(validity.validUntil) - now.getTime()
    const daysUntilExpiry = Math.ceil(remaining / 86_400_000)
    const status = remaining < 0 ? 'EXPIRED' : now.getTime() < Date.parse(validity.validFrom) ? 'NOT_YET_VALID'
      : daysUntilExpiry <= 30 ? 'EXPIRING_SOON' : 'VALID'
    return { ...validity, daysUntilExpiry, status } as const
  }

  async signAndVerify(bytes: Buffer, reason?: string) {
    const credentials = this.credentialArguments()
    return withProcessingWorkspace(async directory => {
      const input = join(directory, 'unsigned.pdf')
      const output = join(directory, 'signed.pdf')
      await writeFile(input, bytes, { mode: 0o600 })
      const args = ['--output', output, ...credentials]
      if (reason) args.push('--reason=' + reason)
      await this.run('sign', input, args)
      return readFile(output)
    })
  }

  async verify(bytes: Buffer) {
    return withProcessingWorkspace(async directory => {
      const input = join(directory, 'signed.pdf')
      await writeFile(input, bytes, { mode: 0o600 })
      await this.run('verify', input, [])
    })
  }

  private credentialArguments() {
    const { certificate, passwordFile, intermediateChain } = this.config
    if (!certificate || !passwordFile) throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
    const args = ['--certificate=' + certificate, '--password-file=' + passwordFile]
    if (intermediateChain) args.push('--intermediate-chain=' + intermediateChain)
    return args
  }

  private async run(mode: 'sign' | 'verify' | 'inspect', input: string, args: string[]) {
    try {
      return await execute(
        this.config.python,
        [resolve('scripts/pdf-a1.py'), mode, input, this.config.trustRoot, ...args],
        { timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 },
      )
    } catch (error) {
      const exit = error instanceof Error && 'code' in error ? error.code : undefined
      const known = typeof exit === 'number' ? failureByExitCode[exit] : undefined
      if (known) throw new AppError(...known)
      if (typeof exit === 'string' || exit === 1 || exit === 2 || mode === 'inspect')
        throw new AppError(503, 'LABORATORY_SIGNER_INVALID_CONFIGURATION')
      throw new AppError(502, mode === 'verify' ? 'REPORT_SIGNATURE_VERIFICATION_FAILED' : 'REPORT_SIGNING_FAILED')
    }
  }
}
