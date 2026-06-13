import { Request, Response, NextFunction, RequestHandler } from 'express'
import { ApiKeyPrincipal, ApiScope, hasScope, allowsAccount } from '../../contexts/user/domain/ApiKey.js'
import type { AuthenticateApiKeyUseCase } from '../../contexts/user/application/ManageApiKeysUseCase.js'

export interface ApiKeyRequest extends Request {
  apiKey?: ApiKeyPrincipal
}

function extractKey(req: Request): string | null {
  const header = req.headers.authorization
  if (header?.startsWith('Api-Key ')) return header.slice(8).trim()
  const x = req.headers['x-api-key']
  if (typeof x === 'string' && x) return x.trim()
  return null
}

// Never reads a Bearer token so the API key and JWT auth surfaces stay cleanly separate
export function buildApiKeyMiddleware(authenticate: AuthenticateApiKeyUseCase): RequestHandler {
  return async (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    const raw = extractKey(req)
    if (!raw) {
      res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } })
      return
    }
    try {
      const principal = await authenticate.execute(raw)
      if (!principal) {
        res.status(401).json({ error: { code: 'INVALID_API_KEY', message: 'Invalid API key' } })
        return
      }
      req.apiKey = principal
      next()
    } catch (err) {
      next(err)
    }
  }
}

// Guards by scope and by the key's account allow-list so mount after buildApiKeyMiddleware
export function requireScope(scope: ApiScope): RequestHandler {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    const principal = req.apiKey
    if (!principal || !hasScope(principal, scope)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
      return
    }
    const accountId = (req.params as { accountId?: string }).accountId
    if (accountId && !allowsAccount(principal, accountId)) {
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Forbidden' } })
      return
    }
    next()
  }
}
