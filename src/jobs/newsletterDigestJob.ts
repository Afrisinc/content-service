import cron, { ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { newsletterDigestService } from '@/services/newsletterDigest.service';
import { logger } from '@/utils/logger';

let cronJob: ScheduledTask | null = null;
let running = false;

export function startNewsletterDigestJob() {
  if (cronJob) {
    logger.warn('Newsletter digest job already running, skipping initialization');
    return;
  }

  if (!env.NEWSLETTER_DIGEST_ENABLED) {
    logger.info('Newsletter digest job disabled (NEWSLETTER_DIGEST_ENABLED is not true)');
    return;
  }

  const schedule = env.CRON_SCHEDULE_NEWSLETTER_DIGEST;
  logger.info(`Starting newsletter digest cron job (schedule: ${schedule})`);

  cronJob = cron.schedule(schedule, async () => {
    if (running) {
      logger.warn('Previous digest run still in progress, skipping this tick');
      return;
    }

    running = true;

    try {
      const result = await newsletterDigestService.run();

      logger.info(
        {
          status: result.status,
          reason: result.reason,
          notifyCampaignId: result.notifyCampaignId,
          articles: result.articleIds?.length,
        },
        'Newsletter digest job completed'
      );
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error running newsletter digest job'
      );
    } finally {
      running = false;
    }
  });

  logger.info('Newsletter digest cron job initialized successfully');
}

export function stopNewsletterDigestJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Newsletter digest cron job stopped');
  }
}
