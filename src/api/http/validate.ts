import type { Request } from 'express'
import type { ZodType } from 'zod'
import { ValidationError } from '../../shared/errors/index.js'

function parse<T>(schema: ZodType<T>, data: unknown, source: string): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw new ValidationError(`Invalid ${source}`, {
      source,
      issues: result.error.issues,
    })
  }
  return result.data
}

export function validateBody<T>(req: Request, schema: ZodType<T>): T {
  return parse(schema, req.body, 'body')
}

export function validateParams<T>(req: Request, schema: ZodType<T>): T {
  return parse(schema, req.params, 'params')
}

export function validateQuery<T>(req: Request, schema: ZodType<T>): T {
  return parse(schema, req.query, 'query')
}
