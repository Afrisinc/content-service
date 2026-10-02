export const NEWS_ARTICLE_STATUSES = [
  'draft',
  'processing',
  'published',
  'skipped',
  'failed',
] as const;

export type NewsArticleStatus = (typeof NEWS_ARTICLE_STATUSES)[number];

/**
 * An enhancement run marks an article `processing` before its OpenAI calls and
 * only moves it on when every step succeeds. A run that dies midway leaves it
 * there, and only `draft` is ever picked up — so past this age it is orphaned.
 */
export const STUCK_AFTER_MINUTES = 30;

export const NEWS_BATCH_SIZE_OPTIONS = [1, 2] as const;

export type NewsBatchSize = (typeof NEWS_BATCH_SIZE_OPTIONS)[number];

export const DEFAULT_NEWS_BATCH_SIZE: NewsBatchSize = 1;

export interface NewsAgentSettings {
  batchSize: number;
}

export interface NewsPostSource {
  title: string;
  summary: string | null;
  standfirst: string | null;
  category: string;
  source: string | null;
  publishedAt: string;
  tags: string[];
  articleUrl: string;
  sourceUrl?: string | null;
  coverUrl: string;
}

export type NewsSocialStatus = 'drafted' | 'skipped' | 'failed';

export interface NewsSocialOutcome {
  userId: string;
  groupName: string | null;
  status: NewsSocialStatus;
  reason: string | null;
}
