import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'

vi.mock('dotenv/config', () => ({}))
vi.mock('../db/client.js', () => ({ db: { query: vi.fn(), end: vi.fn() } }))

import {
  parseArgs, parseWindow, formatListLine, formatRun, formatStep, readTrail, trailCommand,
} from './failures.js'

describe('failures parseArgs', () => {
  it('defaults to listing recent failures', () => {
    expect(parseArgs([])).toEqual({ mode: 'list', limit: 20 })
  })

  it('parses the account, window, stage and limit filters', () => {
    expect(parseArgs(['--account=acc-1', '--since=7d', '--stage=login', '--limit=5'])).toEqual({
      mode: 'list', accountId: 'acc-1', sinceMs: 7 * 86_400_000, stage: 'login', limit: 5,
    })
  })

  it('switches to the detail view when a run is named', () => {
    expect(parseArgs(['--run=run-1'])).toEqual({ mode: 'detail', runId: 'run-1' })
  })

  it('rejects a stage outside the recorded vocabulary', () => {
    // The stage filter has to match what the harness actually writes, or it silently
    // returns nothing and reads as "no failures".
    expect(() => parseArgs(['--stage=extract'])).toThrow(/Invalid --stage/)
  })

  it.each([['--limit=0'], ['--limit=-1'], ['--limit=abc']])('rejects %s', (arg) => {
    expect(() => parseArgs([arg])).toThrow(/Invalid --limit/)
  })

  it('rejects an argument it does not recognise rather than ignoring it', () => {
    expect(() => parseArgs(['--acount=typo'])).toThrow(/Unrecognized argument/)
  })

  it.each([
    ['30m', 1_800_000],
    ['24h', 86_400_000],
    ['7d', 604_800_000],
  ])('parses the %s window', (input, expected) => {
    expect(parseWindow(input)).toBe(expected)
  })

  it.each([['7'], ['d7'], ['7w'], ['']])('rejects the malformed window %s', (input) => {
    expect(() => parseWindow(input)).toThrow(/Invalid --since/)
  })
})

describe('failures formatting', () => {
  const item = {
    runId: 'run-1',
    startedAt: new Date('2026-08-13T10:00:00.000Z'),
    durationMs: 4200,
    accountId: 'acc-1',
    bank: 'mi-dinero',
    scriptVersion: '2.0.2',
    failureType: 'login_failed',
    stopReason: null,
    failingStage: 'login',
  }

  it('shows every field the list view promises, on one line', () => {
    const line = formatListLine(item)
    expect(line).toContain('2026-08-13T10:00:00.000Z')
    expect(line).toContain('4.2s')
    expect(line).toContain('mi-dinero')
    expect(line).toContain('acc-1')
    expect(line).toContain('2.0.2')
    expect(line).toContain('login_failed')
    expect(line).toContain('run-1')
    expect(line.split('\n')).toHaveLength(1)
  })

  it('renders a missing field as a dash rather than null', () => {
    const line = formatListLine({ ...item, durationMs: null, scriptVersion: null, bank: null })
    expect(line).not.toContain('null')
    expect(line).toContain('—')
  })

  const run = {
    runId: 'run-1', accountId: 'acc-1', bank: 'mi-dinero', scriptVersion: '2.0.2',
    status: 'success', transactionsFound: null as number | null, failureType: null as string | null,
    stopReason: 'stop_requested' as string | null, errorMessage: null as string | null,
    startedAt: new Date('2026-08-13T10:00:00.000Z'), finishedAt: null, durationMs: 60_000,
  }

  it('explains an uncounted persistent run rather than showing nothing', () => {
    const text = formatRun(run)
    expect(text).toContain('stop_requested')
    expect(text).toContain('not counted')
  })

  it('does not blame a failed run’s missing count on persistence', () => {
    // A failed run has no count because it failed — a different thing entirely.
    const text = formatRun({ ...run, status: 'failed', failureType: 'login_failed' })
    expect(text).not.toContain('not counted')
    expect(text).toContain('transactions —')
  })

  it('prints a failed stage with its error, url and a trimmed stack', () => {
    const text = formatStep({
      stepIndex: 3, step: 'login', status: 'failed', failureType: 'login_failed',
      errorMessage: 'bad credentials', stack: 'Error: bad credentials\n at a\n at b\n at c\n at d\n at e',
      url: 'https://bank.example/login', durationMs: 1200, createdAt: new Date(),
    })
    expect(text).toContain('login')
    expect(text).toContain('bad credentials')
    expect(text).toContain('https://bank.example/login')
    // Trimmed: a full stack would bury the rest of the report.
    expect(text).not.toContain('at e')
  })

  it('omits the detail lines a successful stage has nothing to fill', () => {
    const text = formatStep({
      stepIndex: 0, step: 'launch', status: 'success', failureType: null,
      errorMessage: null, stack: null, url: null, durationMs: 900, createdAt: new Date(),
    })
    expect(text).not.toContain('error:')
    expect(text).not.toContain('url:')
    expect(text.split('\n')).toHaveLength(1)
  })
})

describe('retrieving the trail from the log files', () => {
  let dir: string
  beforeEach(async () => { dir = await mkdtemp(path.join(tmpdir(), 'failures-')) })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

  const trailLine = (runId: string, events: string[]) => JSON.stringify({
    level: 'error', message: 'failure_trail', runId,
    trail: events.map((event) => ({ event })),
  })

  it('finds the run’s trail among unrelated lines', async () => {
    await writeFile(path.join(dir, 'error-2026-08-13.log'), [
      JSON.stringify({ level: 'error', message: 'something else', runId: 'run-9' }),
      trailLine('run-1', ['login_submit_start', 'authenticated']),
      trailLine('run-2', ['other']),
    ].join('\n'))

    expect(await readTrail('run-1', dir)).toEqual([
      { event: 'login_submit_start' }, { event: 'authenticated' },
    ])
  })

  it('searches the newest file first, so a rotated older run is still reachable', async () => {
    await writeFile(path.join(dir, 'error-2026-08-01.log'), trailLine('run-old', ['ancient']))
    await writeFile(path.join(dir, 'error-2026-08-13.log'), trailLine('run-new', ['recent']))

    expect(await readTrail('run-new', dir)).toEqual([{ event: 'recent' }])
    expect(await readTrail('run-old', dir)).toEqual([{ event: 'ancient' }])
  })

  it('returns null when the trail has rotated away, rather than failing the command', async () => {
    await writeFile(path.join(dir, 'error-2026-08-13.log'), trailLine('run-1', ['x']))
    expect(await readTrail('run-absent', dir)).toBeNull()
  })

  it('returns null when there is no logs directory at all', async () => {
    expect(await readTrail('run-1', path.join(dir, 'nope'))).toBeNull()
  })

  it('ignores a corrupt line instead of aborting the scan', async () => {
    await writeFile(path.join(dir, 'error-2026-08-13.log'), [
      '{"runId":"run-1","message":"failure_trail", TRUNCATED',
      trailLine('run-1', ['recovered']),
    ].join('\n'))
    expect(await readTrail('run-1', dir)).toEqual([{ event: 'recovered' }])
  })

  it('ignores a line that merely mentions the run id', async () => {
    await writeFile(path.join(dir, 'error-2026-08-13.log'), [
      JSON.stringify({ level: 'error', message: 'failure_trail', runId: 'other', note: 'run-1' }),
      trailLine('run-1', ['real']),
    ].join('\n'))
    expect(await readTrail('run-1', dir)).toEqual([{ event: 'real' }])
  })

  it('prints a command that retrieves the same trail by run id alone', () => {
    const command = trailCommand('run-1', '/var/logs')
    expect(command).toContain('run-1')
    expect(command).toContain('error-*.log')
    expect(command).toContain('failure_trail')
  })
})
