import type { FastifyRequest } from 'fastify'
import { AppError } from '../../../domain.js'
import type { A1Material } from '../../../lib/a1-credential-store.js'
import { requireLaboratoryAdmin, type Scope } from '../../../use-cases/laboratory/scope.js'
import { scope } from '../request-scope.js'

const documentFields = new Set(['certificate', 'trustRoot', 'intermediateChain'])

export function configureA1(configure: (scope: Scope, material: A1Material) => Promise<unknown>) {
  return async (request: FastifyRequest) => {
    const context = scope(request)
    requireLaboratoryAdmin(context)
    const input: Partial<A1Material> = Object.create(null)
    const invalid = () => new AppError(422, 'INVALID_A1_UPLOAD')
    for await (const part of request.parts({ limits: { files: 3, fields: 1, parts: 5, fileSize: 1024 * 1024, fieldSize: 1024 } })) {
      const name = part.fieldname as keyof A1Material
      if (name in input) throw invalid()
      if (part.type === 'file' && documentFields.has(name)) {
        const bytes = await part.toBuffer()
        if (!bytes.length || part.file.truncated) throw invalid()
        input[name] = bytes.toString('base64')
      } else if (part.type === 'field' && name === 'password' && !part.valueTruncated &&
        typeof part.value === 'string' && part.value.length > 0 && !/[\r\n]/.test(part.value)) {
        input.password = Buffer.from(part.value).toString('base64')
      } else {
        throw invalid()
      }
    }
    if (!input.certificate || !input.password || !input.trustRoot) throw invalid()
    return configure(context, {
      certificate: input.certificate, password: input.password, trustRoot: input.trustRoot,
      intermediateChain: input.intermediateChain,
    })
  }
}
