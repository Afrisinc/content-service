import 'dotenv/config';

export const env = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret',
  CONTENT_ENCRYPTION_KEY: process.env.CONTENT_ENCRYPTION_KEY || '',
  SERVICE_SECRET: process.env.SERVICE_SECRET || 'gateway-service-secret-change-in-production',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL || 'gpt-4',
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  SM_AI_AGENT_URL: process.env.SM_AI_AGENT_URL || '',
  API_BASE_URL: process.env.API_BASE_URL || `localhost:${process.env.PORT || 3000}`,
  ASSETS_API_URL: process.env.ASSETS_API_URL || 'http://localhost:8081',
  ASSETS_API_KEY: process.env.ASSETS_API_KEY || 'default-api-key',
  CRON_SCHEDULE_POSTS: process.env.CRON_SCHEDULE_POSTS || '*/5 * * * *',
  REDIS_URL: process.env.REDIS_URL || '',
  SOCIAL_PAGES_CACHE_TTL_SECONDS: Number(process.env.SOCIAL_PAGES_CACHE_TTL_SECONDS) || 3600,
  AI_MEMORY_TTL_SECONDS: Number(process.env.AI_MEMORY_TTL_SECONDS) || 86400,
  AI_MEMORY_MAX_TURNS: Number(process.env.AI_MEMORY_MAX_TURNS) || 20,
  // 0 disables the per-user daily spend guard.
  AI_DAILY_BUDGET_MICRO_USD: Number(process.env.AI_DAILY_BUDGET_MICRO_USD) || 0,
  AI_MEMORY_SUMMARISE: process.env.AI_MEMORY_SUMMARISE === 'true',
  AI_MEMORY_SUMMARY_MODEL: process.env.AI_MEMORY_SUMMARY_MODEL || 'claude-haiku-4-5',
  AI_MEMORY_KEEP_RECENT_TURNS: Number(process.env.AI_MEMORY_KEEP_RECENT_TURNS) || 8,
  AI_MEMORY_SUMMARISE_AFTER_TURNS: Number(process.env.AI_MEMORY_SUMMARISE_AFTER_TURNS) || 24,

  // Notify (campaign delivery)
  NOTIFY_API_URL: process.env.NOTIFY_API_URL || '',
  NOTIFY_APP_ID: process.env.NOTIFY_APP_ID || '',
  NOTIFY_ACCOUNT_ID: process.env.NOTIFY_ACCOUNT_ID || '',

  // Daily newsletter digest
  NEWSLETTER_DIGEST_ENABLED: process.env.NEWSLETTER_DIGEST_ENABLED === 'true',
  CRON_SCHEDULE_NEWSLETTER_DIGEST: process.env.CRON_SCHEDULE_NEWSLETTER_DIGEST || '30 6 * * *',
  NEWSLETTER_DIGEST_MODEL: process.env.NEWSLETTER_DIGEST_MODEL || 'gpt-4o',
  NEWSLETTER_ARTICLE_LIMIT: Number(process.env.NEWSLETTER_ARTICLE_LIMIT) || 5,
  NEWSLETTER_MIN_ARTICLES: Number(process.env.NEWSLETTER_MIN_ARTICLES) || 3,
  NEWSLETTER_RECIPIENT_TAGS: (process.env.NEWSLETTER_RECIPIENT_TAGS || 'newsletter')
    .split(',')
    .map(tag => tag.trim())
    .filter(Boolean),
  NEWSLETTER_SEND_DELAY_MINUTES: Number(process.env.NEWSLETTER_SEND_DELAY_MINUTES) || 60,
  NEWSLETTER_SITE_URL: process.env.NEWSLETTER_SITE_URL || 'https://afrisinc.com',
} as const;
