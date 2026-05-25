import { describe, it, expect, vi } from 'vitest'
import { UserOperationModeReaderAdapter } from './UserOperationModeReaderAdapter.js'

describe('UserOperationModeReaderAdapter (conciliation)', () => {
  it('delegates getOperationMode to userRepo', async () => {
    const userRepo = { getOperationMode: vi.fn().mockResolvedValue('automatic') }
    const adapter = new UserOperationModeReaderAdapter(userRepo as any)
    expect(await adapter.getOperationMode('u-1')).toBe('automatic')
    expect(userRepo.getOperationMode).toHaveBeenCalledWith('u-1')
  })

  it('passes through null', async () => {
    const userRepo = { getOperationMode: vi.fn().mockResolvedValue(null) }
    const adapter = new UserOperationModeReaderAdapter(userRepo as any)
    expect(await adapter.getOperationMode('u-1')).toBeNull()
  })
})
