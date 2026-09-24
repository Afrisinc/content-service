import { env } from '@/config/env';

export const AGENT_KEYS = ['post', 'story', 'news', 'newsletter', 'analytics'] as const;

export type AgentKey = (typeof AGENT_KEYS)[number];

export const WORKSPACE_RUN_OWNER = 'workspace';

/**
 * `user` agents run separately for each user whose policy has them on.
 * `workspace` agents run once for everyone, while any counted policy has them on.
 */
export type AgentScope = 'user' | 'workspace';

export interface AgentSchedule {
  label: string;
  cron: string;
}

export interface AgentDefinition {
  key: AgentKey;
  runAgent: string;
  name: string;
  description: string;
  scope: AgentScope;
  /** Only runs while its policy is on autopilot and not paused. */
  requiresAutopilot: boolean;
  /** Applies until a user makes a choice for this agent. */
  enabledByDefault: boolean;
  /** The server's kill switch: when false nothing in the dashboard can start it. */
  allowedByServer: () => boolean;
  schedules: () => AgentSchedule[];
}

/**
 * The one place an agent is declared. A new scheduled agent needs an entry here
 * and an `agentControlService.isActive(key)` check at the top of its cron tick.
 */
export const AGENT_REGISTRY: Record<AgentKey, AgentDefinition> = {
  post: {
    key: 'post',
    runAgent: 'post-agent',
    name: 'Post agent',
    description: 'Drafts, designs and queues social posts for the brands you put on autopilot.',
    scope: 'user',
    requiresAutopilot: true,
    enabledByDefault: true,
    allowedByServer: () => env.AUTOPILOT_ENABLED,
    schedules: () => [{ label: 'Checks for open slots', cron: env.CRON_SCHEDULE_AUTOPILOT }],
  },
  story: {
    key: 'story',
    runAgent: 'story',
    name: 'Story agent',
    description:
      'Writes the next episode of your active stories and leaves each one ready for your review.',
    scope: 'user',
    requiresAutopilot: true,
    enabledByDefault: false,
    allowedByServer: () => env.STORY_AGENT_ENABLED,
    schedules: () => [{ label: 'Writes due episodes', cron: env.CRON_SCHEDULE_STORY_AGENT }],
  },
  news: {
    key: 'news',
    runAgent: 'news',
    name: 'News agent',
    description:
      'Reads African news feeds, lets GPT-4o judge and rewrite what matters, draws a cover ' +
      'and publishes it to the website.',
    scope: 'workspace',
    requiresAutopilot: true,
    enabledByDefault: false,
    allowedByServer: () => env.NEWS_AGENT_ENABLED,
    schedules: () => [
      { label: 'Fetch feeds', cron: env.CRON_SCHEDULE_NEWS_INGEST },
      { label: 'Write & publish', cron: env.CRON_SCHEDULE_NEWS_ENHANCE },
    ],
  },
  newsletter: {
    key: 'newsletter',
    runAgent: 'newsletter',
    name: 'Newsletter digest',
    description: "Emails subscribers the week's best articles through Notify.",
    scope: 'workspace',
    requiresAutopilot: false,
    enabledByDefault: true,
    allowedByServer: () => env.NEWSLETTER_DIGEST_ENABLED,
    schedules: () => [{ label: 'Sends the digest', cron: env.CRON_SCHEDULE_NEWSLETTER_DIGEST }],
  },
  analytics: {
    key: 'analytics',
    runAgent: 'analytics',
    name: 'Analytics sync',
    description: 'Pulls reach, views and engagement from the connected social platforms.',
    scope: 'workspace',
    requiresAutopilot: false,
    enabledByDefault: true,
    allowedByServer: () => env.ANALYTICS_PULL_ENABLED,
    schedules: () => [{ label: 'Syncs metrics', cron: env.CRON_SCHEDULE_ANALYTICS_PULL }],
  },
};

export function isAgentKey(value: string): value is AgentKey {
  return (AGENT_KEYS as readonly string[]).includes(value);
}

export function agentKeyForRun(runAgent: string): AgentKey | null {
  return AGENT_KEYS.find(key => AGENT_REGISTRY[key].runAgent === runAgent) ?? null;
}

export function runOwnersFor(userId: string): string[] {
  return [userId, WORKSPACE_RUN_OWNER];
}
