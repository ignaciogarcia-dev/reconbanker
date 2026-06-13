import { describe, it, expect, vi } from 'vitest'
import request from 'supertest'
import { buildRealtimeRouter } from './realtime.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import type { ITokenIssuer } from '../../contexts/user/domain/ports/ITokenIssuer.js'

function makeIssuer(): ITokenIssuer & { issue: ReturnType<typeof vi.fn> } {
  return {
    issue: vi.fn(() => 'ws-ticket'),
    verify: vi.fn(() => ({ sub: 'user-1', email: 'user@example.com' })),
  }
}

describe('realtime.routes', () => {
  it('issues a ws-scoped ticket for an authenticated user', async () => {
    const issuer = makeIssuer()
    const app = buildTestApp({ basePath: '/realtime', router: buildRealtimeRouter(issuer), protected: true })

    const res = await request(app).post('/realtime/ticket').set('Authorization', AUTH_HEADER)

    expect(res.status).toBe(200)
    expect(res.body.ticket).toBe('ws-ticket')
    expect(typeof res.body.ttl_seconds).toBe('number')
    expect(issuer.issue).toHaveBeenCalledWith(
      { sub: 'user-1', email: '', scope: 'ws' },
      expect.objectContaining({ expiresIn: expect.stringMatching(/s$/) }),
    )
  })

  it('returns 401 when no userId is present', async () => {
    const issuer = makeIssuer()
    const app = buildTestApp({ basePath: '/realtime', router: buildRealtimeRouter(issuer), protected: false })

    const res = await request(app).post('/realtime/ticket')

    expect(res.status).toBe(401)
    expect(issuer.issue).not.toHaveBeenCalled()
  })
})
