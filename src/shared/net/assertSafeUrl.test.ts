import { describe, it, expect } from 'vitest'
import { assertSafeUrl } from './assertSafeUrl.js'
import { ValidationError } from '../errors/index.js'

describe('assertSafeUrl', () => {
  it('accepts a public http(s) URL with a literal IP', async () => {
    const url = await assertSafeUrl('https://93.184.216.34/hook', 'webhook_url')
    expect(url.hostname).toBe('93.184.216.34')
  })

  it('rejects a malformed URL', async () => {
    await expect(assertSafeUrl('not a url')).rejects.toBeInstanceOf(ValidationError)
  })

  it.each([
    ['ftp://93.184.216.34/x', 'non-http protocol'],
    ['file:///etc/passwd', 'file protocol'],
    ['gopher://93.184.216.34', 'gopher protocol'],
  ])('rejects %s (%s)', async (raw) => {
    await expect(assertSafeUrl(raw)).rejects.toBeInstanceOf(ValidationError)
  })

  it.each([
    'http://localhost/x',
    'http://sub.localhost/x',
    'http://127.0.0.1/x',
    'http://0.0.0.0/x',
    'http://10.1.2.3/x',
    'http://172.16.5.5/x',
    'http://192.168.1.1/x',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1/x',
    'http://[::1]/x',
    'http://[fd00::1]/x',
    'http://[fe80::1]/x',
    'http://[::ffff:127.0.0.1]/x',
  ])('rejects internal/private target %s', async (raw) => {
    await expect(assertSafeUrl(raw)).rejects.toBeInstanceOf(ValidationError)
  })
})
