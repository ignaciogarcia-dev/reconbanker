import { describe, it, expect, vi, beforeEach } from 'vitest'

const getJob = vi.fn()
const add = vi.fn()

vi.mock('./QueueRegistry.js', () => ({
  Queues: {
    bankScrape: { getJob, add },
  },
}))

const { enqueueBankScrape, bankScrapeJobId } = await import('./BankScrapeQueue.js')

describe('bankScrapeJobId', () => {
  it('returns deterministic job id from account id', () => {
    expect(bankScrapeJobId('acc-1')).toBe('scrape-acc-1')
  })
})

describe('enqueueBankScrape', () => {
  beforeEach(() => {
    getJob.mockReset()
    add.mockReset()
  })

  it('returns already_queued when an existing job is found', async () => {
    getJob.mockResolvedValue({ id: 'scrape-acc-1' })

    const result = await enqueueBankScrape('acc-1')

    expect(result).toEqual({ queued: false, reason: 'already_queued' })
    expect(getJob).toHaveBeenCalledWith('scrape-acc-1')
    expect(add).not.toHaveBeenCalled()
  })

  it('adds a new scrape job when none exists', async () => {
    getJob.mockResolvedValue(undefined)
    add.mockResolvedValue(undefined)

    const result = await enqueueBankScrape('acc-2')

    expect(result).toEqual({ queued: true })
    expect(add).toHaveBeenCalledWith(
      'scrape',
      { accountId: 'acc-2' },
      {
        jobId: 'scrape-acc-2',
        removeOnComplete: true,
        removeOnFail: true,
      }
    )
  })
})
