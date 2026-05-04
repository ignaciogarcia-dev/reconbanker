import { Worker, Job } from "bullmq";
import { redis } from "../QueueRegistry.js";
import { logger } from "../../logger/index.js";

const log = logger.child('[bank-scrape]')

const bankScrapeConcurrency = Number(process.env.BANK_SCRAPE_CONCURRENCY ?? 2);

export const bankScrapeWorker = new Worker(
  "bank-scrape",
  async (job: Job) => {
    log.info(`starting job ${job.id}`, { jobData: job.data });

    const keepAlive = setInterval(() => {
      job.extendLock(job.token!, 60_000).catch(() => {});
    }, 30_000);

    try {
      const mod =
        await import("../../../../contexts/banking/application/RunBankScrapeUseCase.js");
      await new mod.RunBankScrapeUseCase().execute(job.data);
      log.info(`job ${job.id} completed`);
    } catch (err) {
      log.error(`job ${job.id} failed`, { error: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      clearInterval(keepAlive);
    }
  },
  {
    connection: redis,
    concurrency:
      Number.isFinite(bankScrapeConcurrency) && bankScrapeConcurrency > 0
        ? bankScrapeConcurrency
        : 2,
    lockDuration: 60_000,
    stalledInterval: 30_000,
  },
);

bankScrapeWorker.on("failed", (job, err) => {
  log.error(`worker failed event`, { jobId: job?.id, error: err.message });
});
