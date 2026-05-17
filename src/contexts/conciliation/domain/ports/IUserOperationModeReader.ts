export type OperationMode = 'reconcile' | 'notify' | string

export interface IUserOperationModeReader {
  getOperationMode(userId: string): Promise<OperationMode | null>
}
