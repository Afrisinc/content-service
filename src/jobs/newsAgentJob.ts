import cron, { ScheduledTask } from 'node-cron';
import { env } from '@/config/env';
import { agentControlService } from '@/services/agentControl.service';
import { newsAgentService } from '@/services/newsAgent.service';
import { logger } from '@/utils/logger';

let ingestJob: ScheduledTask | null = null;
let enhanceJob: ScheduledTask | null = null;

/** The dashboard switch and autopilot decide each tick whether the stage runs. */
async function runIfActive(run: () => Promise<unknown>) {
  try {
    if (await agentControlService.isActive('news')) {
      await run();
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      'News agent tick failed'
    );
  }
}

export function startNewsAgentJobs() {
  if (ingestJob || enhanceJob) {
    logger.warn('News agent jobs already running, skipping initialization');
    return;
  }

  if (!env.NEWS_AGENT_ENABLED) {
    logger.info('News agent disabled by the server (NEWS_AGENT_ENABLED is not true)');
    return;
  }

  ingestJob = cron.schedule(env.CRON_SCHEDULE_NEWS_INGEST, () =>
    runIfActive(() => newsAgentService.runIngestion())
  );
  enhanceJob = cron.schedule(env.CRON_SCHEDULE_NEWS_ENHANCE, () =>
    runIfActive(() => newsAgentService.runEnhancement())
  );

  logger.info(
    { ingest: env.CRON_SCHEDULE_NEWS_INGEST, enhance: env.CRON_SCHEDULE_NEWS_ENHANCE },
    'News agent cron jobs initialized'
  );
}

export function stopNewsAgentJobs() {
  ingestJob?.stop();
  enhanceJob?.stop();
  if (ingestJob || enhanceJob) {
    logger.info('News agent cron jobs stopped');
  }
  ingestJob = null;
  enhanceJob = null;
}
