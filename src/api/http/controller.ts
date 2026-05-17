import { Request, Response, NextFunction, RequestHandler } from 'express'

export type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>

export function controller(handler: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
