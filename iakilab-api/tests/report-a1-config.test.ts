import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadConfig } from '../src/config.js'

const first = {
  laboratoryId: 'd9b0e6c4-b9e7-4421-9c19-bd967c5772ea',
  certificate: '/test/lab-one.p12',
  passwordFile: '/test/lab-one-password',
  trustRoot: '/test/root-one.pem',
}
const second = {
  laboratoryId: '600d6d87-15ca-4b62-acb3-bd5c809d6f97',
  certificate: '/test/lab-two.p12',
  passwordFile: '/test/lab-two-password',
  trustRoot: '/test/root-two.pem',
  intermediateChain: '/test/intermediates-two.pem',
  python: '/test/lab-two-python',
}

describe('A1 por laboratório', () => {
  beforeEach(() => {
    for (const name of [
      'A1_LABORATORIES_JSON', 'A1_LABORATORY_ID', 'A1_CERTIFICATE_PATH',
      'A1_PASSWORD_FILE', 'A1_TRUST_ROOT', 'A1_INTERMEDIATE_CHAIN',
    ]) vi.stubEnv(name, undefined)
    vi.stubEnv('APP_ENV', 'homologation')
    vi.stubEnv('DATABASE_URL', 'postgres://localhost/iakilab')
    vi.stubEnv('JWT_SECRET', 't'.repeat(48))
    vi.stubEnv('WEB_ORIGINS', 'http://localhost:5173')
    vi.stubEnv('COOKIE_SECURE', 'false')
    vi.stubEnv('PUBLIC_REPORT_ORIGIN', 'https://reports.example.test')
    vi.stubEnv('A1_PYTHON', '/test/shared-python')
  })
  afterEach(() => vi.unstubAllEnvs())

  it('carrega credenciais distintas por UUID e deixa outros laboratórios sem assinador', () => {
    vi.stubEnv('A1_LABORATORIES_JSON', JSON.stringify([first, second]))
    const { a1ByLaboratory } = loadConfig()

    expect(a1ByLaboratory?.get(first.laboratoryId)).toMatchObject({
      ...first, python: '/test/shared-python', publicOrigin: 'https://reports.example.test',
    })
    expect(a1ByLaboratory?.get(second.laboratoryId)).toMatchObject(second)
    expect(a1ByLaboratory?.get('78fc95c8-6c80-49ac-b9bd-2edf0340f57d')).toBeUndefined()
  })

  it('rejeita UUIDs duplicados mesmo com grafias diferentes', () => {
    vi.stubEnv('A1_LABORATORIES_JSON', JSON.stringify([
      first, { ...second, laboratoryId: first.laboratoryId.toUpperCase() },
    ]))
    expect(() => loadConfig()).toThrow('Duplicate laboratory UUID')
  })

  it('rejeita o mesmo caminho de PKCS#12 para dois laboratórios', () => {
    vi.stubEnv('A1_LABORATORIES_JSON', JSON.stringify([
      first, { ...second, certificate: '/test/./lab-one.p12' },
    ]))
    expect(() => loadConfig()).toThrow('Each laboratory must have its own A1 certificate path')
  })

  it('preserva a configuração individual e a raiz padrão da importação histórica', () => {
    vi.stubEnv('A1_LABORATORY_ID', first.laboratoryId)
    vi.stubEnv('A1_CERTIFICATE_PATH', first.certificate)
    vi.stubEnv('A1_PASSWORD_FILE', first.passwordFile)
    vi.stubEnv('A1_TRUST_ROOT', first.trustRoot)
    const { a1, a1ByLaboratory } = loadConfig()

    expect(a1ByLaboratory?.get(first.laboratoryId)).toMatchObject(first)
    expect(a1?.trustRoot).toBe(first.trustRoot)
  })

  it('permite iniciar a API com o assinador desativado quando o cadastro A1 está inválido', () => {
    vi.stubEnv('A1_LABORATORIES_JSON', '{invalid-json')
    const config = loadConfig({ tolerateInvalidA1: true })
    expect(config.a1ConfigurationInvalid).toBe(true)
    expect(config.a1ByLaboratory).toBeUndefined()
  })
})
