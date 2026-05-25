import { describe, it, expect, vi } from 'vitest'
import { UserOperationModeReaderAdapter } from './UserOperationModeReaderAdapter.js'

describe('UserOperationModeReaderAdapter (banking)', () => {
  it('delegates getOperationMode to userRepo', async () => {
    const userRepo = { getOperationMode: vi.fn().mockResolvedValue('manual') }
    const adapter = new UserOperationModeReaderAdapter(userRepo as any)
    expect(await adapter.getOperationMode('user-1')).toBe('manual')
    expect(userRepo.getOperationMode).toHaveBeenCalledWith('user-1')
  })

  it('passes through null', async () => {
    const userRepo = { getOperationMode: vi.fn().mockResolvedValue(null) }
    const adapter = new UserOperationModeReaderAdapter(userRepo as any)
    expect(await adapter.getOperationMode('user-1')).toBeNull()
  })
})
