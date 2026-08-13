import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import crypto from 'crypto'
import { getTestPool, truncateAll, closeTestPool } from '../helpers/testDb.js'
import { seedUser, seedAccount, SeededAccount } from '../helpers/seed.js'
import { ScrapeRunRepository } from '../../../src/contexts/banking/infrastructure/ScrapeRunRepository.js'
import { ScrapeStepRepository } from '../../../src/contexts/banking/infrastructure/ScrapeStepRepository.js'
import { executorFromPool } from '../../../src/contexts/banking/infrastructure/Executor.js'
import { ScrapeRunRecorder } from '../../../src/contexts/banking/application/ScrapeRunRecorder.js'
import { SCRAPE_STAGES } from '../../../src/contexts/banking/domain/scrapeStage.js'
import { TimeoutError } from '../../../src/shared/errors/index.js'

// Exercised against a real database on purpose: every constraint this feature widened
// is a CHECK, which fails at write time and not at compile time. An in-memory test of
// the same mapping logic would prove nothing about whether these values are writable.

const ALL_FAILURE_TYPES = [
  'timeout', 'selector_missing', 'login_failed', 'unknown',
  'navigation_failed', 'movements_fetch_failed', 'detail_extraction_failed',
  'auth_timeout', 'logged_out', 'watchdog_timeout', 'browser_closed',
  'session_killed', 'launch_failed', 'script_load_failed', 'credentials_failed',
  'orphaned',
]

let account: SeededAccount
let scriptId: string
let runRepo: ScrapeRunRepository
let stepRepo: ScrapeStepRepository

async function getActiveScriptId(): Promise<string> {
  const { rows } = await getTestPool().query(
    `SELECT id FROM bank_scripts WHERE bank='mi-dinero' AND flow_type='extract_transactions' AND status='active' LIMIT 1`
  )
  return rows[0].id
}

async function newRun(): Promise<string> {
  const runId = crypto.randomUUID()
  await runRepo.create(runId, account.id, scriptId)
  return runId
}

const steps = async (runId: string) =>
  (await getTestPool().query(
    'SELECT * FROM bank_scrape_steps WHERE run_id=$1 ORDER BY step_index', [runId]
  )).rows

const run = async (runId: string) =>
  (await getTestPool().query('SELECT * FROM bank_scrape_runs WHERE id=$1', [runId])).rows[0]

function build(runId: string, logger?: any) {
  return new ScrapeRunRecorder({ runId, runRepo, stepRepo, logger })
}

describe('ScrapeRunRecorder (integration)', () => {
  beforeEach(async () => {
    await truncateAll()
    const user = await seedUser({ email: `rec-${crypto.randomBytes(3).toString('hex')}@test.com` })
    account = await seedAccount(user.id)
    scriptId = await getActiveScriptId()
    runRepo = new ScrapeRunRepository(executorFromPool(getTestPool()))
    stepRepo = new ScrapeStepRepository(executorFromPool(getTestPool()))
  })
  afterAll(async () => { await closeTestPool() })

  describe('constraint coverage', () => {
    it('accepts every stage value the vocabulary declares', async () => {
      const runId = await newRun()
      const rec = build(runId)
      for (const stage of SCRAPE_STAGES) await rec.note(stage, 'success')

      const rows = await steps(runId)
      expect(rows).toHaveLength(SCRAPE_STAGES.length)
      expect(rows.map((r) => r.step)).toEqual([...SCRAPE_STAGES])
    })

    it('accepts all three step statuses, including in-progress', async () => {
      const runId = await newRun()
      await stepRepo.start(runId, 0, 'login')
      await stepRepo.record(runId, 1, 'poll', 'success')
      await stepRepo.record(runId, 2, 'poll', 'failed')

      expect((await steps(runId)).map((r) => r.status)).toEqual(['started', 'success', 'failed'])
    })

    it('accepts every failure category the run table declares', async () => {
      for (const failureType of ALL_FAILURE_TYPES) {
        const runId = await newRun()
        await runRepo.markFailed(runId, 'x', failureType)
        expect((await run(runId)).failure_type).toBe(failureType)
      }
    })
  })

  describe('stage()', () => {
    it('opens a stage in progress and closes it on success with a duration', async () => {
      const runId = await newRun()
      const result = await build(runId).stage('launch', async () => 'browser')

      expect(result).toBe('browser')
      const [row] = await steps(runId)
      expect(row.step).toBe('launch')
      expect(row.status).toBe('success')
      expect(row.duration_ms).not.toBeNull()
      expect(row.error_message).toBeNull()
    })

    it('leaves the row in progress while the stage is still running, so a hang is visible', async () => {
      const runId = await newRun()
      let release: () => void = () => {}
      const gate = new Promise<void>((r) => { release = r })

      const pending = build(runId).stage('login', () => gate)
      // Poll until the started row lands, rather than assuming write ordering.
      for (let i = 0; i < 50 && (await steps(runId)).length === 0; i++) {
        await new Promise((r) => setTimeout(r, 10))
      }

      const [row] = await steps(runId)
      expect(row.step).toBe('login')
      expect(row.status).toBe('started')
      expect(row.duration_ms).toBeNull()

      release()
      await pending
      expect((await steps(runId))[0].status).toBe('success')
    })

    it('records the failure on the same row and rethrows, without inventing a second row', async () => {
      const runId = await newRun()
      const boom = new Error('navigation_failed: selector never appeared')

      await expect(build(runId).stage('navigate', async () => { throw boom })).rejects.toThrow(boom)

      const rows = await steps(runId)
      expect(rows).toHaveLength(1)
      expect(rows[0].status).toBe('failed')
      expect(rows[0].error_message).toBe('navigation_failed: selector never appeared')
      expect(rows[0].stack).toContain('Error: navigation_failed')
    })

    it('numbers repeated visits to the same stage so poll cycle 1 and 3 are distinguishable', async () => {
      const runId = await newRun()
      const rec = build(runId)
      await rec.note('poll', 'success')
      await rec.note('poll', 'failed', { errorMessage: 'second' })
      await rec.note('poll', 'success')

      const rows = await steps(runId)
      expect(rows.map((r) => r.step_index)).toEqual([0, 1, 2])
      expect(rows[1].error_message).toBe('second')
    })
  })

  describe('closing the run', () => {
    it('succeed records the count, stop reason and a derived duration', async () => {
      const runId = await newRun()
      await build(runId).succeed(4, 'stop_requested')

      const r = await run(runId)
      expect(r.status).toBe('success')
      expect(r.transactions_found).toBe(4)
      expect(r.stop_reason).toBe('stop_requested')
      expect(r.duration_ms).not.toBeNull()
      expect(r.finished_at).toBeInstanceOf(Date)
    })

    it('fail derives the category from the thrown-message prefix and adds a step for it', async () => {
      const runId = await newRun()
      await build(runId).fail(new Error('login_failed: bad credentials'), { url: 'https://bank.example/login' })

      const r = await run(runId)
      expect(r.status).toBe('failed')
      expect(r.failure_type).toBe('login_failed')
      expect(r.error_message).toBe('login_failed: bad credentials')

      const [step] = await steps(runId)
      expect(step.step).toBe('login')
      expect(step.status).toBe('failed')
      expect(step.url).toBe('https://bank.example/login')
      expect(step.stack).toContain('login_failed')
    })

    it('falls back to the harness stage when the error names none', async () => {
      const runId = await newRun()
      await build(runId).fail(new TimeoutError('script execution timed out after 600000ms'), { stage: 'load_script' })

      expect((await run(runId)).failure_type).toBe('timeout')
      const [step] = await steps(runId)
      expect(step.step).toBe('load_script')
      expect(step.status).toBe('failed')
    })

    it('writes no step row when the error names no stage and no harness stage is given', async () => {
      const runId = await newRun()
      await build(runId).fail(new Error('something nobody categorised'))

      expect(await steps(runId)).toHaveLength(0)
      expect((await run(runId)).failure_type).toBe('unknown')
    })

    it('honours an explicit failure type, for stop reasons that are not thrown errors', async () => {
      const runId = await newRun()
      await build(runId).fail(new Error('monitor lost the session'), {
        failureType: 'logged_out', stopReason: 'logged_out', stage: 'poll',
      })

      const r = await run(runId)
      expect(r.failure_type).toBe('logged_out')
      expect(r.stop_reason).toBe('logged_out')
    })

    it('closes once — a later fail cannot overwrite a recorded success', async () => {
      const runId = await newRun()
      const rec = build(runId)
      await rec.succeed(2)
      await rec.fail(new Error('login_failed: too late'))

      const r = await run(runId)
      expect(r.status).toBe('success')
      expect(r.transactions_found).toBe(2)
    })
  })

  describe('page state and harness causes', () => {
    it('puts the last observed url on the failing step without the caller passing one', async () => {
      const runId = await newRun()
      const rec = build(runId)
      rec.observeUrl('https://bank.example/movements?accountNumber=1')

      await expect(
        rec.stage('poll', async () => { throw new Error('movements_fetch_failed: gone') })
      ).rejects.toThrow()

      const [row] = await steps(runId)
      expect(row.url).toBe('https://bank.example/movements?accountNumber=1')
    })

    it('ignores an empty url rather than blanking a known one', async () => {
      const runId = await newRun()
      const rec = build(runId)
      rec.observeUrl('https://bank.example/login')
      rec.observeUrl('')
      await rec.fail(new Error('boom'), { stage: 'login' })
      expect((await steps(runId))[0].url).toBe('https://bank.example/login')
    })

    it('names the harness cause instead of unknown when a pre-script stage fails', async () => {
      for (const [stage, expected] of [
        ['launch', 'launch_failed'],
        ['load_script', 'script_load_failed'],
        ['credentials', 'credentials_failed'],
      ] as const) {
        const runId = await newRun()
        const rec = build(runId)
        const err = new Error('chromium refused to start')
        await expect(rec.stage(stage, async () => { throw err })).rejects.toThrow()
        await rec.fail(err)

        expect((await run(runId)).failure_type).toBe(expected)
        // stage() already wrote the row; fail() must not add a duplicate.
        const rows = await steps(runId)
        expect(rows).toHaveLength(1)
        expect(rows[0].step).toBe(stage)
      }
    })

    it('leaves a categorised script failure alone rather than relabelling it', async () => {
      const runId = await newRun()
      const rec = build(runId)
      const err = new Error('login_failed: rejected')
      await expect(rec.stage('load_script', async () => { throw err })).rejects.toThrow()
      await rec.fail(err)
      expect((await run(runId)).failure_type).toBe('login_failed')
    })
  })

  describe('best-effort writes', () => {
    it('never propagates a diagnostics write failure out of stage()', async () => {
      const runId = await newRun()
      const exploding = {
        start: async () => { throw new Error('db down') },
        finish: async () => { throw new Error('db down') },
        record: async () => { throw new Error('db down') },
      }
      const logger: any = { debug() {}, info() {}, warn: vi_fn(), error() {}, child() { return logger } }
      const rec = new ScrapeRunRecorder({ runId, runRepo, stepRepo: exploding, logger })

      await expect(rec.stage('launch', async () => 'ok')).resolves.toBe('ok')
      expect(logger.warn.calls.length).toBeGreaterThan(0)
    })

    it('still rethrows the original stage error when recording it also fails', async () => {
      const runId = await newRun()
      const exploding = {
        start: async () => { throw new Error('db down') },
        finish: async () => { throw new Error('db down') },
        record: async () => { throw new Error('db down') },
      }
      const rec = new ScrapeRunRecorder({ runId, runRepo, stepRepo: exploding })

      await expect(
        rec.stage('launch', async () => { throw new Error('the real failure') })
      ).rejects.toThrow('the real failure')
    })
  })
})

// Minimal call recorder — the integration setup does not pull in vitest mock helpers.
function vi_fn() {
  const f: any = (...args: unknown[]) => { f.calls.push(args) }
  f.calls = [] as unknown[][]
  return f
}
