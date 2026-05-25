import { describe, it, expect, vi, beforeEach } from 'vitest'

const loadActiveMock = vi.fn()
const executeMock = vi.fn()

vi.mock('../../script-engine/infrastructure/ScriptLoader.js', () => ({
  ScriptLoader: { loadActive: (...args: unknown[]) => loadActiveMock(...args) },
}))

vi.mock('../../script-engine/infrastructure/PlaywrightRunner.js', () => ({
  PlaywrightRunner: class {
    execute(...args: unknown[]) { return executeMock(...args) }
  },
}))

import { ScriptEngineAdapter } from './ScriptEngineAdapter.js'

describe('ScriptEngineAdapter', () => {
  beforeEach(() => {
    loadActiveMock.mockReset()
    executeMock.mockReset()
  })

  describe('loadActiveScript', () => {
    it('returns null when ScriptLoader returns null', async () => {
      loadActiveMock.mockResolvedValue(null)
      const adapter = new ScriptEngineAdapter()
      const result = await adapter.loadActiveScript('bancopichincha', 'extract_transactions')
      expect(result).toBeNull()
      expect(loadActiveMock).toHaveBeenCalledWith('bancopichincha', 'extract_transactions')
    })

    it('returns null when the loaded script has no codeSnapshot', async () => {
      loadActiveMock.mockResolvedValue({ id: 'script-1', codeSnapshot: undefined })
      const adapter = new ScriptEngineAdapter()
      const result = await adapter.loadActiveScript('bancopichincha', 'extract_transactions')
      expect(result).toBeNull()
    })

    it('returns id and codeSnapshot when the script is active', async () => {
      loadActiveMock.mockResolvedValue({ id: 'script-1', codeSnapshot: 'return []' })
      const adapter = new ScriptEngineAdapter()
      const result = await adapter.loadActiveScript('bancopichincha', 'extract_transactions')
      expect(result).toEqual({ id: 'script-1', codeSnapshot: 'return []' })
    })
  })

  describe('runScript', () => {
    it('delegates to PlaywrightRunner.execute with a BankScript-shaped payload and forwards the context', async () => {
      const txs = [{
        externalId: 'tx-1',
        referenceHash: 'h1',
        amount: 100,
        currency: 'USD',
        receivedAt: new Date(0),
        raw: {},
      }]
      executeMock.mockResolvedValue(txs)
      const adapter = new ScriptEngineAdapter()
      const result = await adapter.runScript(
        { id: 'script-1', codeSnapshot: 'return []' },
        { accountId: 'acc-1', lastExternalId: null },
      )
      expect(result).toBe(txs)
      expect(executeMock).toHaveBeenCalledWith(
        { id: 'script-1', codeSnapshot: 'return []' },
        { accountId: 'acc-1', lastExternalId: null },
      )
    })

    it('propagates errors thrown by the underlying runner', async () => {
      executeMock.mockRejectedValue(new Error('runner exploded'))
      const adapter = new ScriptEngineAdapter()
      await expect(
        adapter.runScript(
          { id: 'script-1', codeSnapshot: 'return []' },
          { accountId: 'acc-1', lastExternalId: 'x' },
        ),
      ).rejects.toThrow('runner exploded')
    })
  })
})
