import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { ScrapeFailureReadModel } from '../../../src/contexts/banking/infrastructure/ScrapeFailureReadModel.js'

// Against a real database because the value here is entirely in the SQL: a LATERAL join, a
// DISTINCT ON, and two shapes chosen for which index they let Postgres lead with. None of
// that is exercised by anything an in-memory double could stand in for.

let account: SeededAccount
let otherAccount: SeededAccount
let scriptId: string
let reader: ScrapeFailureReadModel

async function insertRun(opts: {
  status?: string
  failureType?: string | null
  stopReason?: string | null
  startedAt?: string
  accountId?: string
  durationMs?: number | null
} = {}): Promise<string> {
  const runId = crypto.randomUUID()
  await getTestPool().query(
    `INSERT INTO bank_scrape_runs
       (id, account_id, script_id, status, failure_type, stop_reason, error_message, started_at, duration_ms)
     VALUES ($1,$2,$3,$4,$5,$6,'something broke', COALESCE($7::timestamptz, now()), $8)`,
    [
      runId,
      opts.accountId ?? account.id,
      scriptId,
      opts.status ?? 'failed',
      opts.failureType === undefined ? 'login_failed' : opts.failureType,
      opts.stopReason ?? null,
      opts.startedAt ?? null,
      opts.durationMs === undefined ? 4200 : opts.durationMs,
    ]
  )
  return runId
}

async function insertStep(runId: string, stepIndex: number, step: string, status: string): Promise<void> {
  await getTestPool().query(
    `INSERT INTO bank_scrape_steps (run_id, step_index, step, status, failure_type, error_message, url)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [runId, stepIndex, step, status, status === 'failed' ? 'login_failed' : null,
     status === 'failed' ? 'stage blew up' : null, 'https://bank.example/x']
  )
}

/** A run with nothing but the columns the schema demands — every nullable one left unset. */
async function insertBareRun(): Promise<string> {
  const runId = crypto.randomUUID()
  await getTestPool().query(
    `INSERT INTO bank_scrape_runs (id, account_id, status, started_at)
     VALUES ($1, $2, 'failed', now())`,
    [runId, account.id]
  )
  return runId
}

describe('ScrapeFailureReadModel (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `rd-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    otherAccount = await seedAccount(user.id)
    const { rows } = await getTestPool().query(
      `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND status='active' LIMIT 1`
    )
    scriptId = rows[0].id
    reader = new ScrapeFailureReadModel(getTestPool())
  })
  afterAll(async () => { await closeTestPool() })

  describe('the list view', () => {
    it('returns only failed runs, most recent first', async () => {
      await insertRun({ startedAt: '2026-08-01T00:00:00Z' })
      const newer = await insertRun({ startedAt: '2026-08-10T00:00:00Z' })
      await insertRun({ status: 'success', failureType: null })
      await insertRun({ status: 'running', failureType: null })

      const runs = await reader.listFailed({ limit: 10 })
      expect(runs).toHaveLength(2)
      expect(runs[0].runId).toBe(newer)
    })

    it('carries every field the list line promises', async () => {
      const runId = await insertRun({ stopReason: 'watchdog_timeout' })
      await insertStep(runId, 0, 'login', 'failed')

      const [run] = await reader.listFailed({ limit: 10 })
      expect(run).toMatchObject({
        runId,
        accountId: account.id,
        bank: 'mi-dinero',
        failureType: 'login_failed',
        stopReason: 'watchdog_timeout',
        failingStage: 'login',
        durationMs: 4200,
      })
      expect(run.scriptVersion).toEqual(expect.any(String))
      expect(run.startedAt).toBeInstanceOf(Date)
    })

    it('names the last failed stage, since a run can fail at more than one', async () => {
      // A poll fails, the script recovers, then the session is lost: the stage that ended
      // the run is the one worth showing.
      const runId = await insertRun()
      await insertStep(runId, 0, 'poll', 'failed')
      await insertStep(runId, 1, 'poll', 'success')
      await insertStep(runId, 2, 'keep_alive', 'failed')

      const [run] = await reader.listFailed({ limit: 10 })
      expect(run.failingStage).toBe('keep_alive')
    })

    it('reports no failing stage for a run that never wrote one', async () => {
      // An orphaned run: the process died before any stage closed.
      await insertRun({ failureType: 'orphaned' })
      const [run] = await reader.listFailed({ limit: 10 })
      expect(run.failingStage).toBeNull()
    })

    it('filters by account', async () => {
      await insertRun()
      const other = await insertRun({ accountId: otherAccount.id })

      const runs = await reader.listFailed({ accountId: otherAccount.id, limit: 10 })
      expect(runs.map((r) => r.runId)).toEqual([other])
    })

    it('filters by time window', async () => {
      await insertRun({ startedAt: '2026-01-01T00:00:00Z' })
      const recent = await insertRun({ startedAt: '2026-08-13T00:00:00Z' })

      const runs = await reader.listFailed({ since: new Date('2026-08-01T00:00:00Z'), limit: 10 })
      expect(runs.map((r) => r.runId)).toEqual([recent])
    })

    it('filters by the stage that failed', async () => {
      const loginFailure = await insertRun()
      await insertStep(loginFailure, 0, 'login', 'failed')
      const pollFailure = await insertRun()
      await insertStep(pollFailure, 0, 'poll', 'failed')

      const runs = await reader.listFailed({ stage: 'login', limit: 10 })
      expect(runs.map((r) => r.runId)).toEqual([loginFailure])
    })

    it('returns a run once even when it failed at the same stage repeatedly', async () => {
      // The stage-filtered shape leads with the steps table, so without DISTINCT ON a run
      // would appear once per matching step row.
      const runId = await insertRun()
      await insertStep(runId, 0, 'poll', 'failed')
      await insertStep(runId, 1, 'poll', 'failed')
      await insertStep(runId, 2, 'poll', 'failed')

      const runs = await reader.listFailed({ stage: 'poll', limit: 10 })
      expect(runs.map((r) => r.runId)).toEqual([runId])
    })

    it('combines the filters rather than letting the stage filter widen the rest', async () => {
      const wanted = await insertRun({ startedAt: '2026-08-13T00:00:00Z' })
      await insertStep(wanted, 0, 'login', 'failed')
      const wrongAccount = await insertRun({ accountId: otherAccount.id, startedAt: '2026-08-13T00:00:00Z' })
      await insertStep(wrongAccount, 0, 'login', 'failed')
      const tooOld = await insertRun({ startedAt: '2026-01-01T00:00:00Z' })
      await insertStep(tooOld, 0, 'login', 'failed')

      const runs = await reader.listFailed({
        accountId: account.id, since: new Date('2026-08-01T00:00:00Z'), stage: 'login', limit: 10,
      })
      expect(runs.map((r) => r.runId)).toEqual([wanted])
    })

    it('lists a run that recorded almost nothing, with nulls in place of the gaps', async () => {
      const runId = await insertBareRun()

      const [run] = await reader.listFailed({ limit: 10 })
      expect(run).toMatchObject({
        runId,
        durationMs: null,
        scriptVersion: null,
        failureType: null,
        stopReason: null,
        failingStage: null,
      })
    })

    it('honours the limit', async () => {
      for (let i = 0; i < 5; i++) await insertRun()
      expect(await reader.listFailed({ limit: 2 })).toHaveLength(2)
    })
  })

  describe('the detail view', () => {
    it('returns the run with its account, bank and script version', async () => {
      const runId = await insertRun({ stopReason: 'logged_out' })

      const run = await reader.findRun(runId)
      expect(run).toMatchObject({
        runId,
        accountId: account.id,
        bank: 'mi-dinero',
        status: 'failed',
        failureType: 'login_failed',
        stopReason: 'logged_out',
        errorMessage: 'something broke',
      })
      expect(run?.scriptVersion).toEqual(expect.any(String))
    })

    it('returns null for a run that does not exist', async () => {
      expect(await reader.findRun(crypto.randomUUID())).toBeNull()
    })

    it('reports every unset column as null rather than undefined', async () => {
      // An orphaned run: the process died before it wrote a script id, a duration, or an
      // outcome. The CLI renders each of these as a dash, which it can only do if the read
      // model hands back null rather than undefined.
      const runId = await insertBareRun()

      const run = await reader.findRun(runId)
      expect(run).toMatchObject({
        runId,
        accountId: account.id,
        status: 'failed',
        scriptVersion: null,
        transactionsFound: null,
        failureType: null,
        stopReason: null,
        errorMessage: null,
        finishedAt: null,
        durationMs: null,
      })
    })

    it('carries every column through when the run recorded all of them', async () => {
      const runId = crypto.randomUUID()
      await getTestPool().query(
        `INSERT INTO bank_scrape_runs
           (id, account_id, script_id, status, transactions_found, failure_type, stop_reason,
            error_message, started_at, finished_at, duration_ms)
         VALUES ($1,$2,$3,'failed',17,'timeout','watchdog_timeout','it timed out',
                 '2026-08-13T10:00:00Z','2026-08-13T10:01:00Z',60000)`,
        [runId, account.id, scriptId]
      )

      expect(await reader.findRun(runId)).toMatchObject({
        transactionsFound: 17,
        failureType: 'timeout',
        stopReason: 'watchdog_timeout',
        errorMessage: 'it timed out',
        finishedAt: new Date('2026-08-13T10:01:00Z'),
        durationMs: 60000,
      })
    })

    it('returns the stages in the order they happened, with their failure detail', async () => {
      const runId = await insertRun()
      await insertStep(runId, 2, 'login', 'failed')
      await insertStep(runId, 0, 'launch', 'success')
      await insertStep(runId, 1, 'credentials', 'success')

      const steps = await reader.listSteps(runId)
      expect(steps.map((s) => s.step)).toEqual(['launch', 'credentials', 'login'])
      expect(steps[2]).toMatchObject({
        status: 'failed', failureType: 'login_failed', errorMessage: 'stage blew up',
        url: 'https://bank.example/x',
      })
    })

    it('returns an empty list for a run with no recorded stages', async () => {
      expect(await reader.listSteps(await insertRun())).toEqual([])
    })

    it('carries a stage’s stack and duration through, and nulls what it never wrote', async () => {
      const runId = await insertRun()
      await getTestPool().query(
        `INSERT INTO bank_scrape_steps
           (run_id, step_index, step, status, failure_type, error_message, stack, url, duration_ms)
         VALUES ($1, 0, 'login', 'failed', 'login_failed', 'bad credentials',
                 'Error: bad credentials\n    at submit', 'https://bank.example/login', 1200),
                ($1, 1, 'close', 'success', NULL, NULL, NULL, NULL, NULL)`,
        [runId]
      )

      const [failed, succeeded] = await reader.listSteps(runId)
      expect(failed).toMatchObject({ stack: expect.stringContaining('at submit'), durationMs: 1200 })
      expect(succeeded).toMatchObject({
        failureType: null, errorMessage: null, stack: null, url: null, durationMs: null,
      })
    })
  })
})
