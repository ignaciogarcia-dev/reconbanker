import type { PoolClient, QueryResult, QueryResultRow } from 'pg'

export interface Tx {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ): Promise<QueryResult<R>>
}

export function txFromClient(client: PoolClient): Tx {
  return {
    query: (text, params) => client.query(text, params as any),
  }
}
