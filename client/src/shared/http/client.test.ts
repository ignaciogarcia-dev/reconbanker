import { describe, expect, it } from 'vitest'
import { resolveApiBaseUrl } from './client'

describe('httpClient', () => {
  it('uses the api prefix by default', () => {
    expect(resolveApiBaseUrl(undefined)).toBe('/api')
  })

  it('falls back to the api prefix when the env var is empty', () => {
    expect(resolveApiBaseUrl('')).toBe('/api')
    expect(resolveApiBaseUrl('   ')).toBe('/api')
  })

  it('uses a custom api base url when configured', () => {
    expect(resolveApiBaseUrl('https://api.example.com')).toBe('https://api.example.com')
  })
})
