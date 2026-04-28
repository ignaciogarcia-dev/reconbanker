import { Queues } from './QueueRegistry.js'

export type EnqueueBankScrapeResult =
  | { queued: true }
  | { queued: false; reason: 'already_queued' }

export function bankScrapeJobId(accountId: string): string {
  return `scrape-${accountId}`
}

export async function enqueueBankScrape(accountId: string): Promise<EnqueueBankScrapeResult> {
  const jobId = bankScrapeJobId(accountId)
  const existingJob = await Queues.bankScrape.getJob(jobId)

  if (existingJob) {
    return { queued: false, reason: 'already_queued' }
  }

  await Queues.bankScrape.add(
    'scrape',
    { accountId },
    {
      jobId,
      removeOnComplete: true,
      removeOnFail: true,
    }
  )

  return { queued: true }
}
