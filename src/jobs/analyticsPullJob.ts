import cron, { ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { analyticsOutcome } from '@/helpers/agentRunOutcome.helper';
import { agentControlService } from '@/services/agentControl.service';
import { agentRunRecorder } from '@/services/agentRunRecorder.service';
import { analyticsPullService } from '@/services/analyticsPull.service';
import { logger } from '@/utils/logger';

let cronJob: ScheduledTask | null = null;
let running = false;

export function startAnalyticsPullJob() {
  if (cronJob) {
    logger.warn('Analytics pull job already running, skipping initialization');
    return;
  }

  if (!env.ANALYTICS_PULL_ENABLED) {
    logger.info('Analytics pull job disabled (ANALYTICS_PULL_ENABLED is false)');
    return;
  }

  const schedule = env.CRON_SCHEDULE_ANALYTICS_PULL;
  logger.info(`Starting analytics pull cron job (schedule: ${schedule})`);

  cronJob = cron.schedule(schedule, async () => {
    // A sweep that outruns its tick must not start a second one: both would
    // spend the same hourly quota and read the same rows.
    if (running) {
      logger.warn('Previous analytics pull still in progress, skipping this tick');
      return;
    }

    running = true;

    try {
      if (!(await agentControlService.isActive('analytics'))) {
        logger.debug('Analytics sync switched off in the dashboard, skipping this tick');
        return;
      }

      const report = await agentRunRecorder.record({
        agent: 'analytics',
        trigger: 'schedule',
        topic: 'Analytics sync',
        stepLabel: 'Sync metrics',
        execute: () => analyticsPullService.run(),
        outcome: analyticsOutcome,
      });
      logger.info({ ...report }, 'Analytics pull job completed');
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error running analytics pull job'
      );
    } finally {
      running = false;
    }
  });

  logger.info('Analytics pull cron job initialized successfully');
}

export function stopAnalyticsPullJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    logger.info('Analytics pull cron job stopped');
  }
}
