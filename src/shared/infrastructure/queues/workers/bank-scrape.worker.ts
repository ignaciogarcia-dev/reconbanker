import { Worker, Job } from "bullmq";
import { redis } from "../QueueRegistry.js";

const bankScrapeConcurrency = Number(process.env.BANK_SCRAPE_CONCURRENCY ?? 2);

export const bankScrapeWorker = new Worker(
  "bank-scrape",
  async (job: Job) => {
    console.log(`[bank-scrape] starting job ${job.id}`, job.data);

    const keepAlive = setInterval(() => {
      job.extendLock(job.token!, 60_000).catch(() => {});
    }, 30_000);

    try {
      const mod =
        await import("../../../../contexts/banking/application/RunBankScrapeUseCase.js");
      await new mod.RunBankScrapeUseCase().execute(job.data);
      console.log(`[bank-scrape] job ${job.id} completed`);
    } catch (err) {
      console.error(`[bank-scrape] job ${job.id} failed:`, err);
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
  console.error(`[bank-scrape] worker failed event:`, job?.id, err.message);
});
