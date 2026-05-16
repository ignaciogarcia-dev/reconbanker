export type OperationMode = 'reconcile' | 'passthrough'

export interface User {
  id: string
  email: string
  name: string | null
  operationMode: OperationMode | null
}
