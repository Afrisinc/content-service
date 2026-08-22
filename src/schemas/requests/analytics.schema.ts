const VIEW_SOURCES = ['direct', 'search', 'social', 'newsletter', 'referral'] as const;
const SHARE_PLATFORMS = ['facebook', 'twitter', 'linkedin', 'whatsapp', 'other'] as const;

export const TrackAnalyticsEventSchema = {
  description:
    'Record a reader event against a published post. Public and rate-limited: it ' +
    'answers 202 without waiting for anything a reader should not wait for.',
  body: {
    type: 'object',
    required: ['event'],
    additionalProperties: false,
    anyOf: [{ required: ['mediaPostId'] }, { required: ['slug'] }],
    properties: {
      mediaPostId: { type: 'string', format: 'uuid' },
      slug: { type: 'string', minLength: 1, maxLength: 255 },
      event: { type: 'string', enum: ['view', 'read_complete', 'share'] },
      source: { type: 'string', enum: VIEW_SOURCES },
      platform: { type: 'string', enum: SHARE_PLATFORMS },
      visitorId: { type: 'string', minLength: 8, maxLength: 64 },
    },
  },
};

export const GetAnalyticsSummarySchema = {
  description: 'Totals, source and share breakdowns, categories and top posts for a window',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
    },
  },
};

export const GetTopAnalyticsSchema = {
  description: 'The posts that performed best over the last N days',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      days: { type: 'integer', minimum: 1, maximum: 365, default: 7 },
      limit: { type: 'integer', minimum: 1, maximum: 50, default: 5 },
      by: { type: 'string', enum: ['views', 'shares', 'completion'], default: 'views' },
    },
  },
};

export const GetAnalyticsOverviewSchema = {
  description:
    'Daily trend, per-platform totals, best-performing posts and the insights ' +
    'derived from them, for one window',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
    },
  },
};

export const GetAnalyticsAccountsSchema = {
  description: 'Connected accounts with follower movement and how each performed in the window',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
    },
  },
};

export const GetAnalyticsPlanSchema = {
  description: 'What to post next week, derived from what has performed in the window',
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      from: { type: 'string', format: 'date' },
      to: { type: 'string', format: 'date' },
    },
  },
};
