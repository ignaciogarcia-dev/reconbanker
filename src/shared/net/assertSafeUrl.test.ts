import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'

// Stubbed so the resolution rules are asserted without a network round trip — and so a
// resolver that answers differently on someone's machine cannot change the verdict.
vi.mock('node:dns/promises', () => ({ lookup: vi.fn() }))

import { lookup } from 'node:dns/promises'
import { assertSafeUrl } from './assertSafeUrl.js'
import { ValidationError } from '../errors/index.js'

const lookupMock = lookup as unknown as Mock

const resolvesTo = (...addresses: string[]): void => {
  lookupMock.mockResolvedValue(
    addresses.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }))
  )
}

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
    'http://224.0.0.1/x',
    'http://240.0.0.1/x',
    'http://[ff02::1]/x',
  ])('rejects internal/private target %s', async (raw) => {
    await expect(assertSafeUrl(raw)).rejects.toBeInstanceOf(ValidationError)
  })

  it('accepts a public IPv6 literal', async () => {
    const url = await assertSafeUrl('https://[2606:4700:4700::1111]/hook')
    expect(url.hostname).toBe('[2606:4700:4700::1111]')
  })

  describe('resolving a hostname', () => {
    beforeEach(() => { lookupMock.mockReset() })

    it('accepts a hostname that resolves to a public address', async () => {
      resolvesTo('93.184.216.34')

      const url = await assertSafeUrl('https://hooks.example.com/x', 'webhook_url')
      expect(url.hostname).toBe('hooks.example.com')
      expect(lookupMock).toHaveBeenCalledWith('hooks.example.com', { all: true })
    })

    it('rejects a public hostname that points at an internal address', async () => {
      // The reason this guard resolves DNS at all: a name the operator controls can
      // answer with 169.254.169.254 and reach the cloud metadata service.
      resolvesTo('169.254.169.254')

      await expect(assertSafeUrl('https://harmless.example.com/x'))
        .rejects.toThrow(/private or internal address/)
    })

    it('rejects when any one of several answers is internal', async () => {
      // A round-robin record only has to include one internal address to be usable.
      resolvesTo('93.184.216.34', '10.0.0.5')

      await expect(assertSafeUrl('https://harmless.example.com/x'))
        .rejects.toThrow(/private or internal address/)
    })

    it('rejects a hostname that does not resolve', async () => {
      lookupMock.mockRejectedValue(new Error('ENOTFOUND'))

      await expect(assertSafeUrl('https://nope.example.com/x', 'webhook_url'))
        .rejects.toThrow(/webhook_url host could not be resolved/)
    })

    it('rejects an answer it cannot parse rather than assuming it is public', async () => {
      resolvesTo('not-an-address')

      await expect(assertSafeUrl('https://weird.example.com/x'))
        .rejects.toThrow(/private or internal address/)
    })

    it('sees through an IPv4-mapped answer in dotted form', async () => {
      // A resolver can hand back ::ffff:10.0.0.1, which is 10.0.0.1 wearing a v6 hat.
      resolvesTo('::ffff:10.0.0.1')

      await expect(assertSafeUrl('https://harmless.example.com/x'))
        .rejects.toThrow(/private or internal address/)
    })

    it('accepts an IPv4-mapped answer that really is public', async () => {
      resolvesTo('::ffff:93.184.216.34')

      await expect(assertSafeUrl('https://hooks.example.com/x')).resolves.toBeInstanceOf(URL)
    })
  })
})
