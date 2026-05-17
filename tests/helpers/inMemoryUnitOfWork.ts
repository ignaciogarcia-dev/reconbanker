import type { IUnitOfWork } from '../../src/shared/persistence/IUnitOfWork.js'
import type { Tx } from '../../src/shared/persistence/Tx.js'

export class InMemoryUnitOfWork implements IUnitOfWork {
  async run<T>(work: (tx: Tx) => Promise<T>): Promise<T> {
    const fakeTx = { query: async () => ({ rows: [], rowCount: 0 } as any) } as unknown as Tx
    return work(fakeTx)
  }
}
