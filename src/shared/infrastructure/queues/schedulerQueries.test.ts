import { describe, it, expect } from 'vitest'
import {
  SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL,
  PERSISTENT_SESSION_CANDIDATES_SQL,
} from './schedulerQueries.js'

describe('schedulerQueries', () => {
  it('one-shot SQL selects active, one-shot accounts via LEFT JOIN', () => {
    expect(SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL).toContain('LEFT JOIN account_config')
    expect(SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL).toContain("a.status = 'active'")
    expect(SCRAPABLE_ONE_SHOT_ACCOUNTS_SQL).toContain("COALESCE(ac.session_type, 'one-shot') = 'one-shot'")
  })

  it('persistent session SQL selects active, persistent accounts via JOIN', () => {
    expect(PERSISTENT_SESSION_CANDIDATES_SQL).toContain('JOIN account_config')
    expect(PERSISTENT_SESSION_CANDIDATES_SQL).not.toContain('LEFT JOIN')
    expect(PERSISTENT_SESSION_CANDIDATES_SQL).toContain("a.status = 'active'")
    expect(PERSISTENT_SESSION_CANDIDATES_SQL).toContain("ac.session_type = 'persistent'")
  })
})
