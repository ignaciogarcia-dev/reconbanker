import { describe, expect, it, vi } from 'vitest'
import { GetCurrentUserUseCase } from './GetCurrentUserUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'

describe('GetCurrentUserUseCase', () => {
  it('returns the user fields', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue({
        id: 'u-1', email: 'me@x.io', name: 'Me', operationMode: 'reconcile',
        isTotpEnabled: () => true,
      }),
    } as any

    const out = await new GetCurrentUserUseCase(repo).execute('u-1')

    expect(out).toEqual({
      id: 'u-1', email: 'me@x.io', name: 'Me', operationMode: 'reconcile', totpEnabled: true,
    })
  })

  it('throws NotFoundError when the user is missing', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null) } as any
    await expect(new GetCurrentUserUseCase(repo).execute('missing')).rejects.toBeInstanceOf(
      NotFoundError,
    )
  })
})
