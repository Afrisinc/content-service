import { AgentRunStatus, type StoryEpisode } from '@prisma/client';
import { AGENT_REGISTRY } from '@/config/agentRegistry';
import { env } from '@/config/env';
import { isAgentSwitchedOn } from '@/helpers/agentSettings.helper';
import {
  automationPolicyRepository,
  type AutomationPolicyRepository,
} from '@/repositories/automationPolicy.repository';
import { storyRepository, type StoryRepository } from '@/repositories/story.repository';
import {
  storyEpisodeRepository,
  type StoryEpisodeRepository,
} from '@/repositories/storyEpisode.repository';
import {
  agentRunRecorder,
  type AgentRunRecorder,
  type RunOutcome,
  type RunTrigger,
} from '@/services/agentRunRecorder.service';
import { storyService, type StoryService } from '@/services/story.service';
import {
  storyEpisodeService,
  type GenerateEpisodeOptions,
  type StoryEpisodeService,
} from '@/services/storyEpisode.service';
import { logger } from '@/utils/logger';

export interface StoryAgentRunResult {
  users: number;
  written: number;
  failed: number;
}

interface StoryRef {
  id: string;
  userId: string;
  groupId: string | null;
  title: string;
}

interface DueStory {
  story: StoryRef;
  lastNumber: number;
}

const HOUR_MS = 60 * 60 * 1000;
const STORIES_PER_USER = 50;

export function episodeOutcome(episode: StoryEpisode): RunOutcome {
  return {
    status: AgentRunStatus.succeeded,
    detail: [
      `Episode ${episode.episodeNumber}: ${episode.title}`,
      `${episode.wordCount.toLocaleString('en')} words`,
      ...(episode.llmProvider ? [`by ${episode.llmProvider}`] : []),
    ].join(' · '),
  };
}

export function isStoryDue(
  last: Pick<StoryEpisode, 'status' | 'createdAt' | 'publishedAt'> | null,
  now: Date,
  intervalHours: number
): boolean {
  if (!last) {
    return true;
  }
  const releasedAt = last.publishedAt ?? last.createdAt;
  return (
    last.status === 'PUBLISHED' && now.getTime() - releasedAt.getTime() >= intervalHours * HOUR_MS
  );
}

export class StoryAgentService {
  constructor(
    private readonly episodes: Pick<
      StoryEpisodeService,
      'generateNext' | 'regenerate'
    > = storyEpisodeService,
    private readonly stories: Pick<StoryRepository, 'list'> = storyRepository,
    private readonly storyLookup: Pick<StoryService, 'require'> = storyService,
    private readonly episodeRows: Pick<
      StoryEpisodeRepository,
      'lastForStory'
    > = storyEpisodeRepository,
    private readonly policies: Pick<
      AutomationPolicyRepository,
      'findRunnablePolicies'
    > = automationPolicyRepository,
    private readonly recorder: Pick<AgentRunRecorder, 'record'> = agentRunRecorder
  ) {}

  async writeNext(storyId: string, options: GenerateEpisodeOptions, trigger: RunTrigger) {
    const story = await this.storyLookup.require(storyId);
    return this.recorder.record({
      agent: 'story',
      ownerId: story.userId,
      groupId: story.groupId,
      trigger,
      topic: story.title,
      stepLabel: 'Write episode',
      execute: () => this.episodes.generateNext(storyId, options),
      outcome: episodeOutcome,
    });
  }

  async rewrite(storyId: string, episodeId: string, options: GenerateEpisodeOptions) {
    const story = await this.storyLookup.require(storyId);
    return this.recorder.record({
      agent: 'story',
      ownerId: story.userId,
      groupId: story.groupId,
      trigger: 'manual',
      topic: story.title,
      stepLabel: 'Rewrite episode',
      execute: () => this.episodes.regenerate(storyId, episodeId, options),
      outcome: episodeOutcome,
    });
  }

  async runScheduled(now: Date = new Date()): Promise<StoryAgentRunResult> {
    const policies = await this.policies.findRunnablePolicies(now);
    const userIds = policies
      .filter(policy => isAgentSwitchedOn(AGENT_REGISTRY.story, policy.agents))
      .map(policy => policy.userId);

    const result: StoryAgentRunResult = { users: userIds.length, written: 0, failed: 0 };

    for (const userId of userIds) {
      const due = await this.dueStories(userId, now);
      for (const { story, lastNumber } of due.slice(0, env.STORY_AGENT_MAX_PER_RUN)) {
        try {
          await this.writeNext(
            story.id,
            { idempotencyKey: `story-agent:${lastNumber}` },
            'schedule'
          );
          result.written += 1;
        } catch (error) {
          result.failed += 1;
          logger.warn(
            {
              storyId: story.id,
              error: error instanceof Error ? error.message : String(error),
            },
            'story_agent.episode_failed'
          );
        }
      }
    }

    logger.info(result, 'story_agent.completed');
    return result;
  }

  private async dueStories(userId: string, now: Date): Promise<DueStory[]> {
    const { items } = await this.stories.list({
      userId,
      status: 'ACTIVE',
      limit: STORIES_PER_USER,
    });

    const due: DueStory[] = [];
    for (const story of items) {
      const last = await this.episodeRows.lastForStory(story.id);
      if (isStoryDue(last, now, env.STORY_AGENT_INTERVAL_HOURS)) {
        due.push({ story, lastNumber: last?.episodeNumber ?? 0 });
      }
    }
    return due;
  }
}

export const storyAgentService = new StoryAgentService();
