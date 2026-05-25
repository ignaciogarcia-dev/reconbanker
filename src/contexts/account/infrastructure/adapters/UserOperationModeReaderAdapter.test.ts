import { describe, it, expect, vi } from 'vitest'
import { UserOperationModeReaderAdapter } from './UserOperationModeReaderAdapter.js'

describe('UserOperationModeReaderAdapter (account)', () => {
  it('delegates getOperationMode to userRepo and returns its result', async () => {
    const userRepo = { getOperationMode: vi.fn().mockResolvedValue('automatic') }
    const adapter = new UserOperationModeReaderAdapter(userRepo as any)

    const result = await adapter.getOperationMode('user-1')

    expect(userRepo.getOperationMode).toHaveBeenCalledWith('user-1')
    expect(result).toBe('automatic')
  })

  it('passes through null from the repo', async () => {
    const userRepo = { getOperationMode: vi.fn().mockResolvedValue(null) }
    const adapter = new UserOperationModeReaderAdapter(userRepo as any)
    expect(await adapter.getOperationMode('user-1')).toBeNull()
  })
})
