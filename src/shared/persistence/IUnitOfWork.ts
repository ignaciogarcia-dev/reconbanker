import type { Tx } from './Tx.js'

export interface IUnitOfWork {
  run<T>(work: (tx: Tx) => Promise<T>): Promise<T>
}
