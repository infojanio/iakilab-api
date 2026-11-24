import { access, chown, chmod, writeFile } from 'node:fs/promises'
import { constants } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

const raw = process.env.A1_SECRET_FILES_JSON
delete process.env.A1_SECRET_FILES_JSON
try {
  const mount = process.env.RAILWAY_VOLUME_MOUNT_PATH
  if (process.env.RAILWAY_ENVIRONMENT_ID && !mount) throw new Error('Volume required')
  if (mount && (mount !== '/data/pdfs' || process.env.STORAGE_ROOT !== mount))
    throw new Error('Invalid PDF volume mount')
  if (process.getuid?.() === 0) {
    if (mount) {
      await chown(mount, 1000, 1000)
      await chmod(mount, 0o700)
    }
    process.setgroups?.([])
    process.setgid?.(1000)
    process.setuid?.(1000)
  }
  if (mount) await access(mount, constants.W_OK)
} catch {
  console.error('PDF_STORAGE_INVALID_CONFIGURATION')
  process.exit(1)
}

if (raw !== undefined) {
  const secretFiles = z.record(
    z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/),
    z.base64().min(4),
  )
  try {
    for (const [name, value] of Object.entries(secretFiles.parse(JSON.parse(raw)))) {
      await writeFile(join('/run/iakilab-a1', name), Buffer.from(value, 'base64'), { mode: 0o600 })
    }
  } catch {
    console.error('A1_SECRET_FILES_INVALID_CONFIGURATION')
    // Reject the whole signer configuration if secret materialization failed.
    process.env.A1_LABORATORIES_JSON = ''
  }
}
await import('../src/server.js')
