import { describe, expect, it, vi } from 'vitest'
import { GetScriptDetailUseCase } from './GetScriptDetailUseCase.js'
import { ListScriptsUseCase } from './ListScriptsUseCase.js'
import { NotFoundError } from '../../../shared/errors/index.js'

const baseScript = (overrides: Record<string, unknown> = {}) => ({
  id: 's-1',
  bank: 'mi-dinero',
  flowType: 'extract_transactions',
  version: '2.0.1',
  status: 'active',
  origin: 'system',
  createdAt: new Date('2024-01-01T00:00:00Z'),
  baseScriptId: 'base-1',
  codeSnapshot: 'console.log("hi")',
  selectorMap: { login: '#login' },
  ...overrides,
})

describe('GetScriptDetailUseCase', () => {
  it('returns the full detail for a system script regardless of caller', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(baseScript()) } as any
    const out = await new GetScriptDetailUseCase(repo).execute({ scriptId: 's-1', callerId: 'user-1' })

    expect(out).toMatchObject({
      id: 's-1',
      bank: 'mi-dinero',
      baseScriptId: 'base-1',
      codeSnapshot: 'console.log("hi")',
    })
  })

  it('returns null for missing optional fields', async () => {
    const repo = {
      findById: vi.fn().mockResolvedValue(baseScript({ baseScriptId: undefined, codeSnapshot: undefined })),
    } as any
    const out = await new GetScriptDetailUseCase(repo).execute({ scriptId: 's-1', callerId: 'user-1' })

    expect(out.baseScriptId).toBeNull()
    expect(out.codeSnapshot).toBeNull()
  })

  it('throws NotFoundError when the script is missing', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(null) } as any
    await expect(
      new GetScriptDetailUseCase(repo).execute({ scriptId: 'missing', callerId: 'user-1' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it('returns the detail when the caller owns the private script', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(baseScript({ userId: 'user-1' })) } as any
    const out = await new GetScriptDetailUseCase(repo).execute({ scriptId: 's-1', callerId: 'user-1' })
    expect(out.id).toBe('s-1')
  })

  it('throws NotFoundError (masking existence) when the script is privately owned by someone else', async () => {
    const repo = { findById: vi.fn().mockResolvedValue(baseScript({ userId: 'user-1' })) } as any
    await expect(
      new GetScriptDetailUseCase(repo).execute({ scriptId: 's-1', callerId: 'user-2' }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe('ListScriptsUseCase', () => {
  it('maps repository items to list DTOs, scoped to the caller', async () => {
    const findAll = vi.fn().mockResolvedValue([
      baseScript(),
      baseScript({ id: 's-2', version: '2.0.2', status: 'deprecated' }),
    ])
    const repo = { findAll } as any
    const out = await new ListScriptsUseCase(repo).execute({ callerId: 'user-1' })

    expect(findAll).toHaveBeenCalledWith('user-1')
    expect(out).toHaveLength(2)
    expect(out[0].status).toBe('active')
    expect(out[1].status).toBe('deprecated')
    // List DTO does not expose baseScriptId/codeSnapshot/selectorMap.
    expect((out[0] as any).baseScriptId).toBeUndefined()
  })

  it('returns empty array when there are no scripts', async () => {
    const repo = { findAll: vi.fn().mockResolvedValue([]) } as any
    expect(await new ListScriptsUseCase(repo).execute({ callerId: 'user-1' })).toEqual([])
  })
})
