/**
 * One-shot migration: encrypt-at-rest any credentials still stored in plaintext.
 *
 * Safe to run multiple times — values already in the `enc:v1:` format are skipped.
 * Requires CREDENTIALS_ENCRYPTION_KEY and DATABASE_URL in the environment.
 *
 *   pnpm tsx scripts/encrypt-existing-credentials.ts
 */
import 'dotenv/config'
import { db } from '../src/shared/infrastructure/db/client.js'
import { credentialsCipher } from '../src/shared/infrastructure/crypto/CredentialsCipher.js'

async function encryptColumn(table: string, column: string): Promise<number> {
  const cipher = credentialsCipher()
  const { rows } = await db.query<{ account_id: string; value: string | null }>(
    `SELECT account_id, ${column} AS value FROM ${table} WHERE ${column} IS NOT NULL`,
  )
  let updated = 0
  for (const row of rows) {
    if (!row.value || cipher.isEncrypted(row.value)) continue
    await db.query(`UPDATE ${table} SET ${column} = $2 WHERE account_id = $1`, [
      row.account_id,
      cipher.encrypt(row.value),
    ])
    updated++
  }
  return updated
}

async function main(): Promise<void> {
  const results = {
    bank_password: await encryptColumn('bank_credentials', 'encrypted_password'),
    auth_token: await encryptColumn('account_config', 'auth_token'),
    webhook_auth_token: await encryptColumn('account_config', 'webhook_auth_token'),
  }
  // eslint-disable-next-line no-console
  console.log('Encrypted plaintext credentials:', results)
  await db.end()
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err)
  process.exit(1)
})
