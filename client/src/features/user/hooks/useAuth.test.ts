import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useAuth } from './useAuth'

describe('useAuth', () => {
  it('throws when used outside an AuthProvider', () => {
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/)
  })
})
