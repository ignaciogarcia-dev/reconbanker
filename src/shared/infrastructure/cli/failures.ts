import 'dotenv/config'
import path from 'path'
import { readdir, open } from 'fs/promises'
import { fileURLToPath } from 'url'
import { db } from '../db/client.js'
import { logger } from '../../logger/index.js'
import { SCRAPE_STAGES, type ScrapeStage } from '../../domain/scrapeStage.js'
import {
  ScrapeFailureReadModel,
  type FailedRunListItem,
  type RunDetail,
  type RunStep,
} from '../../../contexts/banking/infrastructure/ScrapeFailureReadModel.js'

const log = logger.child('[failures]')

const DEFAULT_LIMIT = 20

const USAGE = `Usage:
  pnpm failures [--account=<uuid>] [--since=<7d|24h|30m>] [--stage=<stage>] [--limit=<n>]
  pnpm failures --run=<uuid>

Stages: ${SCRAPE_STAGES.join(', ')}`

export type FailuresCommand =
  | { mode: 'detail'; runId: string }
  | { mode: 'list'; accountId?: string; sinceMs?: number; stage?: ScrapeStage; limit: number }

const DURATION_UNITS: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 }

/** Parses `7d` / `24h` / `30m` into milliseconds. */
export function parseWindow(value: string): number {
  const match = /^(\d+)([mhd])$/.exec(value)
  if (!match) throw new Error(`Invalid --since: ${value} (expected e.g. 30m, 24h, 7d)`)
  return Number(match[1]) * DURATION_UNITS[match[2]]
}

// A misspelled filter must not be silently ignored: `--acount=x` would otherwise widen the
// query to every account and read as an honest answer.
const KNOWN_FLAGS = new Set(['run', 'account', 'since', 'stage', 'limit'])

// Returns milliseconds rather than a Date so it stays a pure function — the cutoff is
// computed against the clock at the point of use.
export function parseArgs(argv: string[]): FailuresCommand {
  const opts: Record<string, string> = {}
  for (const arg of argv) {
    const match = /^--([a-zA-Z]+)=(.+)$/.exec(arg)
    if (!match || !KNOWN_FLAGS.has(match[1])) {
      throw new Error(`Unrecognized argument: ${arg}\n\n${USAGE}`)
    }
    opts[match[1]] = match[2]
  }

  if (opts.run) return { mode: 'detail', runId: opts.run }

  if (opts.stage && !SCRAPE_STAGES.includes(opts.stage as ScrapeStage)) {
    throw new Error(`Invalid --stage: ${opts.stage} (expected one of ${SCRAPE_STAGES.join(', ')})`)
  }
  const limit = opts.limit ? Number(opts.limit) : DEFAULT_LIMIT
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`Invalid --limit: ${opts.limit}`)

  return {
    mode: 'list',
    ...(opts.account ? { accountId: opts.account } : {}),
    ...(opts.since ? { sinceMs: parseWindow(opts.since) } : {}),
    ...(opts.stage ? { stage: opts.stage as ScrapeStage } : {}),
    limit,
  }
}

const pad = (value: unknown, width: number): string => String(value ?? '—').padEnd(width)
const duration = (ms: number | null): string => (ms === null ? '—' : `${(ms / 1000).toFixed(1)}s`)

export function formatListLine(item: FailedRunListItem): string {
  return [
    pad(item.startedAt instanceof Date ? item.startedAt.toISOString() : item.startedAt, 26),
    pad(duration(item.durationMs), 9),
    pad(item.bank, 12),
    pad(item.accountId, 38),
    pad(item.scriptVersion, 9),
    pad(item.failureType, 26),
    pad(item.stopReason, 18),
    pad(item.failingStage, 18),
    item.runId,
  ].join(' ')
}

export const LIST_HEADER = [
  pad('STARTED', 26), pad('DURATION', 9), pad('BANK', 12), pad('ACCOUNT', 38),
  pad('SCRIPT', 9), pad('FAILURE', 26), pad('STOP REASON', 18), pad('STAGE', 18), 'RUN',
].join(' ')

export function formatStep(step: RunStep): string {
  const head = `  ${String(step.stepIndex).padStart(3)}  ${pad(step.step, 18)} ${pad(step.status, 9)} ${duration(step.durationMs)}`
  const detail = [
    step.failureType ? `        failure: ${step.failureType}` : null,
    step.errorMessage ? `        error:   ${step.errorMessage}` : null,
    step.url ? `        url:     ${step.url}` : null,
    step.stack ? `        stack:   ${step.stack.split('\n').slice(0, 4).join('\n                 ')}` : null,
  ].filter(Boolean)
  return [head, ...detail].join('\n')
}

export function formatRun(run: RunDetail): string {
  return [
    `run          ${run.runId}`,
    `account      ${run.accountId}${run.bank ? ` (${run.bank})` : ''}`,
    `script       ${run.scriptVersion ?? '—'}`,
    `status       ${run.status}`,
    `failure      ${run.failureType ?? '—'}`,
    `stop reason  ${run.stopReason ?? '—'}`,
    `error        ${run.errorMessage ?? '—'}`,
    `started      ${run.startedAt instanceof Date ? run.startedAt.toISOString() : run.startedAt}`,
    `duration     ${duration(run.durationMs)}`,
    // The "not counted" note belongs only to a run that finished cleanly: on a failed run
    // the count is null because it failed, which is not the same thing.
    `transactions ${run.transactionsFound ?? (run.status === 'success'
      ? '— (not counted; a persistent session ingests over its whole lifetime)'
      : '—')}`,
  ].join('\n')
}

const LOGS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..', 'logs')

/**
 * The bridge between the database record and the log files.
 *
 * The pre-failure trail is flushed to `logs/error-*.log` rather than into a column, so a
 * run id is the only thing tying the two together. Rather than leave that as folklore, the
 * detail view retrieves the trail itself — and prints the equivalent command either way.
 */
export async function readTrail(runId: string, logsDir = LOGS_DIR): Promise<unknown[] | null> {
  let files: string[]
  try {
    files = (await readdir(logsDir)).filter((f) => f.startsWith('error-') && f.endsWith('.log'))
  } catch {
    return null // no logs directory on this machine
  }

  // Newest first: a run id is unique, so the first match wins and older files go unread.
  for (const file of files.sort().reverse()) {
    const handle = await open(path.join(logsDir, file), 'r').catch(() => null)
    if (!handle) continue
    try {
      for await (const line of handle.readLines()) {
        // Cheap string test before parsing — these files hold a fortnight of every level.
        if (!line.includes(runId) || !line.includes('failure_trail')) continue
        try {
          const entry = JSON.parse(line)
          if (entry?.runId === runId && Array.isArray(entry.trail)) return entry.trail
        } catch { /* not the line we want */ }
      }
    } finally {
      await handle.close()
    }
  }
  return null
}

export const trailCommand = (runId: string, logsDir = LOGS_DIR): string =>
  `grep -h '${runId}' ${path.join(logsDir, 'error-*.log')} | jq 'select(.message=="failure_trail") | .trail'`

/** The read-model surface the command needs, narrowed so a test can stand in without a database. */
export type FailureReader = Pick<ScrapeFailureReadModel, 'findRun' | 'listSteps' | 'listFailed'>

// Argv, reader, sink and logs directory are parameters rather than things `main` reaches for,
// so the command itself is reachable from a test without a database, a real argv, or the
// process's stdout. The bootstrap below supplies the real ones.
export async function main(
  argv: string[],
  reader: FailureReader,
  out: (line: string) => void,
  logsDir: string
): Promise<void> {
  const command = parseArgs(argv)

  if (command.mode === 'detail') {
    const run = await reader.findRun(command.runId)
    if (!run) {
      log.error(`no run ${command.runId}`)
      process.exitCode = 1
      return
    }
    const steps = await reader.listSteps(command.runId)
    const trail = await readTrail(command.runId, logsDir)

    out(formatRun(run))
    out(`\nstages (${steps.length})`)
    for (const step of steps) out(formatStep(step))

    out(`\nevent trail`)
    if (trail) out(JSON.stringify(trail, null, 2))
    else out('  not found in the local log files (rotated out, or this run failed on another host)')
    out(`\nretrieve it directly with:\n  ${trailCommand(command.runId, logsDir)}`)
    return
  }

  const runs = await reader.listFailed({
    ...(command.accountId ? { accountId: command.accountId } : {}),
    ...(command.sinceMs ? { since: new Date(Date.now() - command.sinceMs) } : {}),
    ...(command.stage ? { stage: command.stage } : {}),
    limit: command.limit,
  })

  if (!runs.length) {
    out('no failed runs matched')
    return
  }
  out(LIST_HEADER)
  for (const run of runs) out(formatListLine(run))
  out(`\n${runs.length} run(s). Inspect one with: pnpm failures --run=<uuid>`)
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`
if (isMain) {
  main(process.argv.slice(2), new ScrapeFailureReadModel(db), console.log, LOGS_DIR)
    .then(() => db.end())
    .catch((err) => {
      log.error('failures failed', { error: err instanceof Error ? err.message : String(err) })
      process.exit(1)
    })
}
