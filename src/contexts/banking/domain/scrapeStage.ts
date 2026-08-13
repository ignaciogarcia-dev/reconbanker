import type { FailureCategory } from './scrapeFailure.js'
import type { ScrapeStage } from '../../../shared/domain/scrapeStage.js'

// The vocabulary itself lives in the shared kernel (script-engine needs it too);
// re-exported here so banking code has one import for stage concepts.
export { SCRAPE_STAGES } from '../../../shared/domain/scrapeStage.js'
export type { ScrapeStage, StepStatus, IStageRecorder } from '../../../shared/domain/scrapeStage.js'

// Categories that name exactly one stage. Scripts already encode these as the prefix
// of their thrown message (see categorizeFailure), so the stage inside an otherwise
// opaque script call is recoverable without any script change.
const CATEGORY_TO_STAGE: Partial<Record<FailureCategory, ScrapeStage>> = {
  login_failed: 'login',
  navigation_failed: 'navigate',
  movements_fetch_failed: 'movements_fetch',
  detail_extraction_failed: 'detail_extraction',
}

/**
 * The stage a failure category points at, or null when it names none.
 *
 * `timeout` and `unknown` could have arisen anywhere, so they map to null and the
 * caller records the harness-visible stage instead.
 */
export function stageFromFailureCategory(category: FailureCategory): ScrapeStage | null {
  return CATEGORY_TO_STAGE[category] ?? null
}
