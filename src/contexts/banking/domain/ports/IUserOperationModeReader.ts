export type OperationMode = 'reconcile' | 'passthrough' | string

export interface IUserOperationModeReader {
  getOperationMode(userId: string): Promise<OperationMode | null>
}
