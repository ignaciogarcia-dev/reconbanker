export interface IConciliationOwnershipChecker {
  ownsRequest(requestId: string, userId: string): Promise<boolean>
  ownsAccount(accountId: string, userId: string): Promise<boolean>
}
