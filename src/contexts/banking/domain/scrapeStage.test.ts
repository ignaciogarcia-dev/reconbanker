import { describe, it, expect } from 'vitest'
import { SCRAPE_STAGES, stageFromFailureCategory } from './scrapeStage.js'
import type { FailureCategory } from './scrapeFailure.js'

describe('scrapeStage', () => {
  it('exposes exactly the eleven stages the step table constrains', () => {
    expect([...SCRAPE_STAGES]).toEqual([
      'launch', 'load_script', 'credentials', 'login', 'auth_wait', 'poll',
      'keep_alive', 'navigate', 'movements_fetch', 'detail_extraction', 'close',
    ])
  })

  describe('stageFromFailureCategory', () => {
    it('maps the in-script categories to their matching stage', () => {
      // The harness awaits one opaque call and cannot see these stages directly, so
      // they are recovered from the category the script encoded in its thrown message.
      expect(stageFromFailureCategory('login_failed')).toBe('login')
      expect(stageFromFailureCategory('navigation_failed')).toBe('navigate')
      expect(stageFromFailureCategory('movements_fetch_failed')).toBe('movements_fetch')
      expect(stageFromFailureCategory('detail_extraction_failed')).toBe('detail_extraction')
    })

    it('returns null for categories that name no single stage', () => {
      // A timeout or an unrecognised message prefix could have happened anywhere; the
      // caller falls back to the harness-visible stage rather than inventing one.
      expect(stageFromFailureCategory('timeout')).toBeNull()
      expect(stageFromFailureCategory('unknown')).toBeNull()
    })

    it('maps every FailureCategory to a valid stage or null', () => {
      const all: FailureCategory[] = [
        'timeout', 'login_failed', 'navigation_failed',
        'movements_fetch_failed', 'detail_extraction_failed', 'unknown',
      ]
      for (const c of all) {
        const stage = stageFromFailureCategory(c)
        if (stage !== null) expect(SCRAPE_STAGES).toContain(stage)
      }
    })
  })
})
