import 'dotenv/config'
import { db } from './client.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { logger } from '../logger/index.js'

const log = logger.child('[migrate]')

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsDir = path.join(__dirname, 'migrations')

async function migrate() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id          SERIAL PRIMARY KEY,
      filename    TEXT NOT NULL UNIQUE,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const { rows } = await db.query(
      'SELECT 1 FROM _migrations WHERE filename = $1',
      [file]
    )
    if (rows.length > 0) {
      log.info(`skip  ${file}`)
      continue
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await db.query(sql)
    await db.query('INSERT INTO _migrations (filename) VALUES ($1)', [file])
    log.info(`apply ${file}`)
  }

  log.info('done')
  await db.end()
}

migrate().catch(err => {
  log.error('migration failed', { error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined })
  process.exit(1)
})
