import type pg from 'pg'
import type { IUnitOfWork } from './IUnitOfWork.js'
import { Tx, txFromClient } from './Tx.js'

export class PgUnitOfWork implements IUnitOfWork {
  constructor(private readonly pool: pg.Pool) {}

  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(txFromClient(client))
      await client.query('COMMIT')
      return result
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
}
