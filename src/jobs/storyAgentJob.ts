import cron, { ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { agentControlService } from '@/services/agentControl.service';
import { storyAgentService } from '@/services/storyAgent.service';
import { logger } from '@/utils/logger';

let cronJob: ScheduledTask | null = null;
let running = false;

export function startStoryAgentJob() {
  if (cronJob) {
    logger.warn('Story agent job already running, skipping initialization');
    return;
  }

  if (!env.STORY_AGENT_ENABLED) {
    logger.info('Story agent job disabled (STORY_AGENT_ENABLED is false)');
    return;
  }

  const schedule = env.CRON_SCHEDULE_STORY_AGENT;
  logger.info(`Starting story agent cron job (schedule: ${schedule})`);

  cronJob = cron.schedule(schedule, async () => {
    if (running) {
      logger.warn('Previous story agent run still in progress, skipping this tick');
      return;
    }

    running = true;

    try {
      if (!(await agentControlService.isActive('story'))) {
        logger.debug('Story agent switched off in the dashboard, skipping this tick');
        return;
      }

      await storyAgentService.runScheduled();
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error running story agent job'
      );
    } finally {
      running = false;
    }
  });

  logger.info('Story agent cron job initialized successfully');
}

export function stopStoryAgentJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Story agent cron job stopped');
  }
}
