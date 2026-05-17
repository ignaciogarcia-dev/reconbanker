import bcrypt from 'bcrypt'
import crypto from 'crypto'
import { getTestPool } from './testDb.js'

export interface SeededUser {
  id: string
  email: string
  password: string
}

export interface SeededAccount {
  id: string
  userId: string
  bankId: string
  bank: string
  name: string
}

export async function seedUser(overrides: { email?: string; password?: string; operationMode?: 'reconcile' | 'passthrough' | null } = {}): Promise<SeededUser> {
  const email = overrides.email ?? `it-${crypto.randomBytes(4).toString('hex')}@test.com`
  const password = overrides.password ?? 'secret123'
  const passwordHash = await bcrypt.hash(password, 4)
  const id = crypto.randomUUID()
  await getTestPool().query(
    `INSERT INTO users (id, email, password_hash, name, operation_mode, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'active', now())`,
    [id, email, passwordHash, 'Test User', overrides.operationMode ?? null]
  )
  return { id, email, password }
}

/**
 * Returns the seeded mi-dinero bank. Migrations create it; this just looks it up.
 */
export async function getMiDineroBank(): Promise<{ id: string; code: string }> {
  const { rows } = await getTestPool().query(`SELECT id, code FROM banks WHERE code = 'mi-dinero'`)
  if (!rows[0]) throw new Error('mi-dinero bank not seeded — migrations missing?')
  return { id: rows[0].id, code: rows[0].code }
}

export async function seedAccount(userId: string, opts: { name?: string; bankCode?: string } = {}): Promise<SeededAccount> {
  const bank = await getMiDineroBank()
  const id = crypto.randomUUID()
  const name = opts.name ?? `acc-${crypto.randomBytes(3).toString('hex')}`
  await getTestPool().query(
    `INSERT INTO accounts (id, user_id, bank_id, bank, name, status, created_at)
     VALUES ($1, $2, $3, $4, $5, 'active', now())`,
    [id, userId, bank.id, bank.code, name]
  )
  return { id, userId, bankId: bank.id, bank: bank.code, name }
}
