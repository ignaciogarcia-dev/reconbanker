import { describe, expect, it } from 'vitest'
import { BcryptPasswordHasher } from './BcryptPasswordHasher.js'

describe('BcryptPasswordHasher', () => {
  it('produces a hash that verifies against the plain text', async () => {
    const hasher = new BcryptPasswordHasher(4) // low rounds for speed
    const hash = await hasher.hash('s3cret')

    expect(hash).not.toBe('s3cret')
    expect(await hasher.verify('s3cret', hash)).toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hasher = new BcryptPasswordHasher(4)
    const hash = await hasher.hash('s3cret')

    expect(await hasher.verify('wrong', hash)).toBe(false)
  })

  it('uses default rounds when none is provided', async () => {
    const hasher = new BcryptPasswordHasher()
    const hash = await hasher.hash('x')
    expect(await hasher.verify('x', hash)).toBe(true)
  })
})
