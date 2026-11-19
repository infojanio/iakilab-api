import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { withProcessingWorkspace } from './processing-workspace.js'

const execute = promisify(execFile)

export type A1Config = {
  python: string
  certificate: string
  passwordFile: string
  trustRoot: string
  laboratoryId: string
  publicOrigin: string
}

export class PdfA1 {
  constructor(private config: Pick<A1Config, 'python' | 'trustRoot'> & Partial<Pick<A1Config, 'certificate' | 'passwordFile'>>) {}

  async signAndVerify(bytes: Buffer) {
    const { certificate, passwordFile } = this.config
    if (!certificate || !passwordFile) throw new Error('Signing credentials are unavailable')
    return withProcessingWorkspace(async directory => {
      const input = join(directory, 'unsigned.pdf')
      const output = join(directory, 'signed.pdf')
      await writeFile(input, bytes, { mode: 0o600 })
      await this.run('sign', input, ['--output', output, '--certificate', certificate, '--password-file', passwordFile])
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

  private async run(mode: 'sign' | 'verify', input: string, args: string[]) {
    await execute(
      this.config.python,
      [resolve('scripts/pdf-a1.py'), mode, input, this.config.trustRoot, ...args],
      { timeout: 45_000, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 },
    )
  }
}
