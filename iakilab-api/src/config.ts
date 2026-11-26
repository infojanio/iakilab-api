import { resolve } from 'node:path'
import type { A1Config } from './lib/pdf-a1.js'
import { z } from 'zod'
export type Config = {
  jwtSecret: string
  origins: string[]
  cookieSecure: boolean
  storageRoot: string
  a1ByLaboratory?: ReadonlyMap<string, A1Config>
  a1?: A1Config
  a1ConfigurationInvalid?: boolean
  reportRectificationEnabled?: boolean
  a1Management?: { key: Buffer; python: string; publicOrigin: string }
}
export function loadConfig({ tolerateInvalidA1 = false } = {}): Config {
  const e = z
    .object({
      APP_ENV: z.literal('homologation'),
      DATABASE_URL: z.string().url(),
      JWT_SECRET: z.string().min(48),
      WEB_ORIGINS: z.string().min(1),
      COOKIE_SECURE: z.enum(['true', 'false']),
      STORAGE_ROOT: z.string().default('./private-storage'),
    })
    .parse(process.env)
  const url = new URL(e.DATABASE_URL)
  const localTest = process.env.RUN_POSTGRES_TESTS === 'true' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname === '/iakilab_test'
  if (!['/iakilab', '/iaki_lab'].includes(url.pathname) && !localTest)
    throw new Error('Only iakilab or iaki_lab databases are allowed (iakilab_test only for explicit local tests)')
  if (/REPLACE|CHANGE_ME/.test(e.JWT_SECRET))
    throw new Error('Replace JWT_SECRET')
  const origins = e.WEB_ORIGINS.split(',').map((s) => s.trim())
  if (origins.some((s) => new URL(s).origin !== s))
    throw new Error('Use exact origins without paths')
  const managementKey = z.string().regex(/^[a-f0-9]{64}$/i).safeParse(process.env.A1_MANAGEMENT_KEY)
  const origin = reportPublicOrigin().safeParse(process.env.PUBLIC_REPORT_ORIGIN)
  const config: Config = {
    jwtSecret: e.JWT_SECRET,
    origins,
    cookieSecure: e.COOKIE_SECURE === 'true',
    storageRoot: e.STORAGE_ROOT,
    reportRectificationEnabled: process.env.ENABLE_REPORT_RECTIFICATION === 'true',
    a1Management: managementKey.success && origin.success ? {
      key: Buffer.from(managementKey.data, 'hex'),
      python: process.env.A1_PYTHON ?? 'python3',
      publicOrigin: origin.data,
    } : undefined,
  }
  try {
    return { ...config, ...loadA1Config() }
  } catch (error) {
    if (!tolerateInvalidA1) throw error
    return { ...config, a1ConfigurationInvalid: true }
  }
}

function loadA1Config() {
  const legacySigner = {
    laboratoryId: process.env.A1_LABORATORY_ID,
    certificate: process.env.A1_CERTIFICATE_PATH,
    passwordFile: process.env.A1_PASSWORD_FILE,
    trustRoot: process.env.A1_TRUST_ROOT,
    intermediateChain: process.env.A1_INTERMEDIATE_CHAIN,
  }
  const hasLegacySigner = Object.values(legacySigner).some((value) => value !== undefined)
  const python = process.env.A1_PYTHON ?? 'python3'
  const signerSchema = z.object({
    laboratoryId: z.string().uuid().transform((value) => value.toLowerCase()),
    certificate: z.string().min(1),
    passwordFile: z.string().min(1),
    trustRoot: z.string().min(1),
    intermediateChain: z.string().min(1).optional(),
    python: z.string().min(1).prefault(python),
  })
  const registry = process.env.A1_LABORATORIES_JSON
  let signers: z.infer<typeof signerSchema>[] = []
  if (registry !== undefined) {
    if (hasLegacySigner)
      throw new Error('Configure either A1_LABORATORIES_JSON or the individual A1 variables')
    let entries: unknown
    try {
      entries = JSON.parse(registry)
    } catch {
      throw new Error('A1_LABORATORIES_JSON must contain valid JSON')
    }
    signers = z.array(signerSchema).min(1).parse(entries)
  } else if (hasLegacySigner) {
    signers = [signerSchema.parse(legacySigner)]
  }
  const a1ByLaboratory = new Map<string, A1Config>()
  if (signers.length) {
    const certificatePaths = new Set<string>()
    const publicOrigin = reportPublicOrigin().parse(process.env.PUBLIC_REPORT_ORIGIN)
    for (const signer of signers) {
      if (a1ByLaboratory.has(signer.laboratoryId))
        throw new Error('Duplicate laboratory UUID in A1 configuration')
      const certificatePath = resolve(signer.certificate)
      if (certificatePaths.has(certificatePath))
        throw new Error('Each laboratory must have its own A1 certificate path')
      certificatePaths.add(certificatePath)
      a1ByLaboratory.set(signer.laboratoryId, { ...signer, publicOrigin })
    }
  }
  return { a1ByLaboratory, a1: registry === undefined ? a1ByLaboratory.values().next().value : undefined }
}

function reportPublicOrigin() {
  return z.string().url().refine((value) => {
      const candidate = new URL(value)
      return value === candidate.origin && (
        candidate.protocol === 'https:' ||
        (candidate.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname))
      )
    })
}
