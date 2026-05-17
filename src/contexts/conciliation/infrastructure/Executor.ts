import type pg from 'pg'
import type { QueryResult, QueryResultRow } from 'pg'

/**
 * Minimal query interface implemented by both pg.Pool (via wrapper) and our Tx.
 * Repositories accept this so they work with or without a transaction.
 */
export interface Executor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<R>>
}

export function executorFromPool(pool: pg.Pool): Executor {
  return {
    query: (text, params) => pool.query(text, params as any),
  }
}
