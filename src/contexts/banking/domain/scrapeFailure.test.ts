import { describe, it, expect } from 'vitest'
import { categorizeFailure, notifiableInternalType } from './scrapeFailure.js'
import { SCRAPE_STAGES, stageFromFailureCategory } from './scrapeStage.js'
import { TimeoutError } from '../../../shared/errors/index.js'

describe('categorizeFailure', () => {
  it('treats a TimeoutError as timeout regardless of message', () => {
    expect(categorizeFailure(new TimeoutError('login_failed: looks like login but it timed out'))).toBe('timeout')
  })

  it('matches the known prefix before the first colon', () => {
    expect(categorizeFailure(new Error('login_failed: authentication timed out'))).toBe('login_failed')
    expect(categorizeFailure(new Error('navigation_failed: could not reach https://bank'))).toBe('navigation_failed')
    expect(categorizeFailure(new Error('movements_fetch_failed: could not load list'))).toBe('movements_fetch_failed')
    expect(categorizeFailure(new Error('detail_extraction_failed: error iterating rows'))).toBe('detail_extraction_failed')
  })

  it('falls back to unknown for unrecognized prefixes and non-Error throwables', () => {
    expect(categorizeFailure(new Error('script crashed'))).toBe('unknown')
    expect(categorizeFailure(new Error('manually reset 1-2-3: job wedged active in BullMQ'))).toBe('unknown')
    expect(categorizeFailure('plain-string-error')).toBe('unknown')
    expect(categorizeFailure(undefined)).toBe('unknown')
  })
})

describe('notifiableInternalType', () => {
  it('routes connection/auth categories to connection.failed', () => {
    expect(notifiableInternalType('login_failed')).toBe('connection.failed')
    expect(notifiableInternalType('navigation_failed')).toBe('connection.failed')
  })

  it('routes every other category to scrape.failed', () => {
    expect(notifiableInternalType('timeout')).toBe('scrape.failed')
    expect(notifiableInternalType('movements_fetch_failed')).toBe('scrape.failed')
    expect(notifiableInternalType('detail_extraction_failed')).toBe('scrape.failed')
    expect(notifiableInternalType('unknown')).toBe('scrape.failed')
  })
})

describe('stageFromFailureCategory', () => {
  it('maps the in-script categories to their matching stage', () => {
    // The harness awaits one opaque call and cannot see these stages directly, so they
    // are recovered from the category the script encoded in its thrown message.
    expect(stageFromFailureCategory('login_failed')).toBe('login')
    expect(stageFromFailureCategory('navigation_failed')).toBe('navigate')
    expect(stageFromFailureCategory('movements_fetch_failed')).toBe('movements_fetch')
    expect(stageFromFailureCategory('detail_extraction_failed')).toBe('detail_extraction')
  })

  it('returns null for categories that name no single stage', () => {
    // A timeout or an unrecognised prefix could have happened anywhere; the caller
    // falls back to the harness-visible stage rather than inventing one.
    expect(stageFromFailureCategory('timeout')).toBeNull()
    expect(stageFromFailureCategory('unknown')).toBeNull()
  })

  it('only ever yields a stage the step table accepts', () => {
    for (const c of ['timeout', 'login_failed', 'navigation_failed',
                     'movements_fetch_failed', 'detail_extraction_failed', 'unknown'] as const) {
      const stage = stageFromFailureCategory(c)
      if (stage !== null) expect(SCRAPE_STAGES).toContain(stage)
    }
  })
})
