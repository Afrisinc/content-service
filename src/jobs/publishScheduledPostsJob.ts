import cron, { ScheduledTask } from 'node-cron';
import { logger } from '@/utils/logger';
import { aiGenerationService } from '@/services/aiGeneration.service';
import { env } from '@/config/env';

let cronJob: ScheduledTask | null = null;

export function startPublishScheduledPostsJob() {
  if (cronJob) {
    logger.warn('Publish scheduled posts job already running, skipping initialization');
    return;
  }

  const schedule = env.CRON_SCHEDULE_POSTS;
  logger.info(`Starting publish scheduled posts cron job (schedule: ${schedule})`);

  cronJob = cron.schedule(schedule, async () => {
    try {
      logger.debug('Running scheduled posts publishing job');

      const result = await aiGenerationService.publishScheduledPosts();

      if (result.published > 0 || result.failed > 0) {
        logger.info(
          {
            published: result.published,
            failed: result.failed,
            errors: result.errors,
          },
          'Scheduled posts publishing job completed'
        );
      } else {
        logger.debug('No scheduled posts ready to publish');
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error running scheduled posts publishing job'
      );
    }
  });

  logger.info('Publish scheduled posts cron job initialized successfully');
}

export function stopPublishScheduledPostsJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Publish scheduled posts cron job stopped');
  }
}
