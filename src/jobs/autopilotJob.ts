import { env } from '@/config/env';
import { automationService } from '@/services/automation.service';
import { logger } from '@/utils/logger';
import cron, { ScheduledTask } from 'node-cron';

let cronJob: ScheduledTask | null = null;
let running = false;

export function startAutopilotJob() {
  if (cronJob) {
    logger.warn('Autopilot job already running, skipping initialization');
    return;
  }

  // A restart is exactly when abandoned runs need clearing, and this has to
  // happen whether or not the cron itself is switched on — a hand-triggered run
  // can be interrupted just the same.
  automationService.reconcileInterruptedRuns().catch(error => {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'Could not reconcile interrupted agent runs on start-up'
    );
  });

  if (!env.AUTOPILOT_ENABLED) {
    logger.info('Autopilot job disabled by configuration');
    return;
  }

  const schedule = env.CRON_SCHEDULE_AUTOPILOT;
  logger.info(`Starting autopilot cron job (schedule: ${schedule})`);

  cronJob = cron.schedule(schedule, async () => {
    // A pass can outlast a tick — drafting calls an LLM and a render service.
    if (running) {
      logger.warn('Previous autopilot pass still in progress, skipping this tick');
      return;
    }

    running = true;

    try {
      // A process that died mid-run leaves rows marked running for ever. Clear
      // them before starting anything new so the log stays truthful.
      await automationService.reconcileInterruptedRuns();

      const result = await automationService.runDueUsers();

      if (result.drafted > 0) {
        logger.info(result, 'Autopilot pass completed');
      } else {
        logger.debug(result, 'Autopilot pass produced nothing this tick');
      }
    } catch (error) {
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        },
        'Error running autopilot job'
      );
    } finally {
      running = false;
    }
  });

  logger.info('Autopilot cron job initialized successfully');
}

export function stopAutopilotJob() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    running = false;
    logger.info('Autopilot cron job stopped');
  }
}
