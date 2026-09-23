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
