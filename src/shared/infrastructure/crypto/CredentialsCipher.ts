import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const PREFIX = 'enc:v1:'
const ALGO = 'aes-256-gcm'

/**
 * Authenticated symmetric encryption for secrets stored at rest (bank
 * passwords, polling/webhook auth tokens).
 *
 * Ciphertext format: `enc:v1:<iv>:<authTag>:<ciphertext>` (each part base64).
 * decrypt() passes through any value without the prefix unchanged, so existing
 * plaintext rows keep working and get re-encrypted on their next write.
 */
export class CredentialsCipher {
  private readonly key: Buffer

  constructor(key: Buffer) {
    if (key.length !== 32) {
      throw new Error('CredentialsCipher key must be exactly 32 bytes')
    }
    this.key = key
  }

  static fromBase64(b64: string): CredentialsCipher {
    return new CredentialsCipher(Buffer.from(b64, 'base64'))
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12)
    const cipher = createCipheriv(ALGO, this.key, iv)
    const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const authTag = cipher.getAuthTag()
    return PREFIX + [iv, authTag, ciphertext].map((b) => b.toString('base64')).join(':')
  }

  decrypt(value: string): string {
    if (!value.startsWith(PREFIX)) return value // legacy plaintext
    const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(':')
    const decipher = createDecipheriv(ALGO, this.key, Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([
      decipher.update(Buffer.from(ctB64, 'base64')),
      decipher.final(),
    ]).toString('utf8')
  }

  encryptNullable(value: string | null): string | null {
    return value == null ? null : this.encrypt(value)
  }

  decryptNullable(value: string | null): string | null {
    return value == null ? null : this.decrypt(value)
  }

  isEncrypted(value: string): boolean {
    return value.startsWith(PREFIX)
  }
}

let singleton: CredentialsCipher | null = null

/** Lazily builds the process-wide cipher from CREDENTIALS_ENCRYPTION_KEY (base64). */
export function credentialsCipher(): CredentialsCipher {
  if (singleton) return singleton
  const key = process.env.CREDENTIALS_ENCRYPTION_KEY
  if (!key) {
    throw new Error('CREDENTIALS_ENCRYPTION_KEY is required to encrypt/decrypt credentials')
  }
  singleton = CredentialsCipher.fromBase64(key)
  return singleton
}

/** Test seam: clears the memoized singleton so a new env key takes effect. */
export function resetCredentialsCipher(): void {
  singleton = null
}
