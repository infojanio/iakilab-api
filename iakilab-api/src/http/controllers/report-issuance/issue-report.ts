import type { FastifyRequest } from 'fastify'
import { z } from 'zod'
import type { IssueReport } from '../../../use-cases/reports/issue-report.js'
import { identifier, scope } from '../request-scope.js'

const body = z.object({ revision: z.number().int().min(1) }).strict()

export function issueReport(useCase: IssueReport) {
  return async (request: FastifyRequest) => {
    return useCase.execute(scope(request), identifier(request), body.parse(request.body).revision)
  }
}
