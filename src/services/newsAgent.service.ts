import { env } from '@/config/env';
import { enhancementOutcome, ingestionOutcome } from '@/helpers/agentRunOutcome.helper';
import { resolveNewsSources } from '@/helpers/rssFeed.helper';
import {
  agentRunRecorder,
  type AgentRunRecorder,
  type RunTrigger,
} from '@/services/agentRunRecorder.service';
import {
  newsEnhancementService,
  type EnhancementResult,
  type NewsEnhancementService,
} from '@/services/newsEnhancement.service';
import {
  newsIngestionService,
  type IngestionResult,
  type NewsIngestionService,
} from '@/services/newsIngestion.service';
import { logger } from '@/utils/logger';

export type NewsAgentStage = 'ingest' | 'enhance';

interface StageState<T> {
  running: boolean;
  lastResult: T | null;
  lastError: string | null;
  lastFinishedAt: string | null;
}

function emptyState<T>(): StageState<T> {
  return { running: false, lastResult: null, lastError: null, lastFinishedAt: null };
}

/**
 * The single entry point for both pipeline stages, whether the cron or an editor
 * starts them, so a manual run can never overlap a scheduled one on this instance.
 */
export class NewsAgentService {
  private readonly ingest = emptyState<IngestionResult>();
  private readonly enhance = emptyState<EnhancementResult>();

  constructor(
    private readonly ingestion: Pick<NewsIngestionService, 'run'> = newsIngestionService,
    private readonly enhancement: Pick<NewsEnhancementService, 'run'> = newsEnhancementService,
    private readonly recorder: Pick<AgentRunRecorder, 'record'> = agentRunRecorder
  ) {}

  runIngestion(trigger: RunTrigger = 'schedule'): Promise<IngestionResult | null> {
    return this.runStage(
      this.ingest,
      () =>
        this.recorder.record({
          agent: 'news',
          trigger,
          topic: 'Fetch news feeds',
          stepLabel: 'Fetch feeds',
          execute: () => this.ingestion.run(),
          outcome: ingestionOutcome,
        }),
      'ingest'
    );
  }

  runEnhancement(trigger: RunTrigger = 'schedule'): Promise<EnhancementResult | null> {
    return this.runStage(
      this.enhance,
      () =>
        this.recorder.record({
          agent: 'news',
          trigger,
          topic: 'Write & publish news',
          stepLabel: 'Write & publish',
          execute: () => this.enhancement.run(),
          outcome: enhancementOutcome,
        }),
      'enhance'
    );
  }

  /** Starts a stage in the background; false when that stage is already running. */
  trigger(stage: NewsAgentStage): boolean {
    const state = stage === 'ingest' ? this.ingest : this.enhance;
    if (state.running) {
      return false;
    }
    void (stage === 'ingest' ? this.runIngestion('manual') : this.runEnhancement('manual'));
    return true;
  }

  status() {
    return {
      allowedByServer: env.NEWS_AGENT_ENABLED,
      sources: resolveNewsSources(env.NEWS_RSS_SOURCES).length,
      minScore: env.NEWS_MIN_SCORE,
      batchSize: env.NEWS_ENHANCE_BATCH_SIZE,
      ingest: { schedule: env.CRON_SCHEDULE_NEWS_INGEST, ...this.ingest },
      enhance: { schedule: env.CRON_SCHEDULE_NEWS_ENHANCE, ...this.enhance },
    };
  }

  private async runStage<T>(
    state: StageState<T>,
    run: () => Promise<T>,
    stage: NewsAgentStage
  ): Promise<T | null> {
    if (state.running) {
      logger.warn({ stage }, 'news_agent.stage_busy');
      return null;
    }

    state.running = true;
    try {
      const result = await run();
      state.lastResult = result;
      state.lastError = null;
      return result;
    } catch (error) {
      state.lastError = error instanceof Error ? error.message : String(error);
      logger.error({ stage, error: state.lastError }, 'news_agent.stage_failed');
      return null;
    } finally {
      state.running = false;
      state.lastFinishedAt = new Date().toISOString();
    }
  }
}

export const newsAgentService = new NewsAgentService();
