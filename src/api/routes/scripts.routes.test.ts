import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import type { RequestHandler } from 'express'
import { buildScriptsRouter } from './scripts.routes.js'
import { buildTestApp, AUTH_HEADER } from '../../../tests/helpers/buildTestApp.js'
import { NotFoundError } from '../../shared/errors/index.js'
import type { ScriptEngineModule } from '../../composition/scriptEngineModule.js'

const allowAdmin: RequestHandler = (_req, _res, next) => next()
const denyAdmin: RequestHandler = (_req, res) => { res.status(403).json({ error: 'Forbidden' }) }

type MockedScriptEngineModule = {
  listScripts: { execute: ReturnType<typeof vi.fn> }
  getScriptDetail: { execute: ReturnType<typeof vi.fn> }
  promoteScript: { execute: ReturnType<typeof vi.fn> }
}

function makeModule(): MockedScriptEngineModule {
  return {
    listScripts: { execute: vi.fn() },
    getScriptDetail: { execute: vi.fn() },
    promoteScript: { execute: vi.fn() },
  }
}

function makeApp(mod: MockedScriptEngineModule, requireAdmin: RequestHandler = allowAdmin) {
  return buildTestApp({
    basePath: '/scripts',
    router: buildScriptsRouter(mod as unknown as ScriptEngineModule, requireAdmin),
    protected: true,
  })
}

const SCRIPT_ID = '33333333-3333-4333-8333-333333333333'

describe('scripts.routes', () => {
  let mod: MockedScriptEngineModule

  beforeEach(() => {
    mod = makeModule()
  })

  describe('GET /scripts', () => {
    it('returns 200 with the scripts list', async () => {
      mod.listScripts.execute.mockResolvedValue([{ id: 's1', name: 'one' }])

      const res = await request(makeApp(mod))
        .get('/scripts')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual([{ id: 's1', name: 'one' }])
      expect(mod.listScripts.execute).toHaveBeenCalledTimes(1)
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(mod)).get('/scripts')
      expect(res.status).toBe(401)
      expect(mod.listScripts.execute).not.toHaveBeenCalled()
    })

    it('returns 500 on unexpected errors', async () => {
      mod.listScripts.execute.mockRejectedValue(new Error('boom'))

      const res = await request(makeApp(mod))
        .get('/scripts')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(500)
      expect(res.body.error.code).toBe('INTERNAL_ERROR')
    })
  })

  describe('GET /scripts/:scriptId', () => {
    it('returns 200 with the script detail on a valid uuid', async () => {
      mod.getScriptDetail.execute.mockResolvedValue({ id: SCRIPT_ID, name: 'one' })

      const res = await request(makeApp(mod))
        .get(`/scripts/${SCRIPT_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ id: SCRIPT_ID, name: 'one' })
      expect(mod.getScriptDetail.execute).toHaveBeenCalledWith(SCRIPT_ID)
    })

    it('returns 400 when scriptId is not a uuid', async () => {
      const res = await request(makeApp(mod))
        .get('/scripts/not-a-uuid')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(res.body.error.details.source).toBe('params')
      expect(mod.getScriptDetail.execute).not.toHaveBeenCalled()
    })

    it('returns 404 when the use case throws NotFoundError', async () => {
      mod.getScriptDetail.execute.mockRejectedValue(new NotFoundError('Script not found'))

      const res = await request(makeApp(mod))
        .get(`/scripts/${SCRIPT_ID}`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(404)
      expect(res.body.error.code).toBe('NOT_FOUND')
    })
  })

  describe('POST /scripts/:scriptId/promote', () => {
    it('returns 200 with promoted true on a valid uuid', async () => {
      mod.promoteScript.execute.mockResolvedValue(undefined)

      const res = await request(makeApp(mod))
        .post(`/scripts/${SCRIPT_ID}/promote`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(200)
      expect(res.body).toEqual({ promoted: true })
      expect(mod.promoteScript.execute).toHaveBeenCalledWith({ scriptId: SCRIPT_ID })
    })

    it('returns 400 when scriptId is not a uuid', async () => {
      const res = await request(makeApp(mod))
        .post('/scripts/bad/promote')
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(400)
      expect(res.body.error.code).toBe('VALIDATION_ERROR')
      expect(mod.promoteScript.execute).not.toHaveBeenCalled()
    })

    it('returns 401 when auth header is missing', async () => {
      const res = await request(makeApp(mod)).post(`/scripts/${SCRIPT_ID}/promote`)
      expect(res.status).toBe(401)
    })

    it('returns 403 when the user is not an admin', async () => {
      const res = await request(makeApp(mod, denyAdmin))
        .post(`/scripts/${SCRIPT_ID}/promote`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(403)
      expect(mod.promoteScript.execute).not.toHaveBeenCalled()
    })

    it('returns 500 on unexpected errors', async () => {
      mod.promoteScript.execute.mockRejectedValue(new Error('kaboom'))

      const res = await request(makeApp(mod))
        .post(`/scripts/${SCRIPT_ID}/promote`)
        .set('Authorization', AUTH_HEADER)

      expect(res.status).toBe(500)
    })
  })
})
