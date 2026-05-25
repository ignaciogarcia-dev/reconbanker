import { describe, it, expect } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from '../../../../tests/msw/server'
import { listBanks } from './banks'

describe('banks api', () => {
  it('listBanks maps rows into Bank objects', async () => {
    server.use(
      http.get('/api/banks', () =>
        HttpResponse.json([
          { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: 'https://x', status: 'ready' },
        ])
      )
    )
    await expect(listBanks()).resolves.toEqual([
      { id: 'b-1', code: 'mi-dinero', name: 'Mi Dinero', loginUrl: 'https://x', status: 'ready' },
    ])
  })
})
