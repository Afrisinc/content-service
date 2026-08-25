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

  // Brand asset uploads. The render service refuses anything past its own
  // ceiling, so there is no point accepting more here than it will take.
  BRAND_ASSET_MAX_BYTES: Number(process.env.BRAND_ASSET_MAX_BYTES) || 12 * 1024 * 1024,
  BRAND_ASSET_MAX_FILES: Number(process.env.BRAND_ASSET_MAX_FILES) || 40,

  // Post agent + render service
  RENDER_SERVICE_URL: process.env.RENDER_SERVICE_URL || 'http://localhost:8090',
  RENDER_SERVICE_API_KEY: process.env.RENDER_SERVICE_API_KEY || '',
  RENDER_SERVICE_TIMEOUT_MS: Number(process.env.RENDER_SERVICE_TIMEOUT_MS) || 60000,
  POST_AGENT_MODEL: process.env.POST_AGENT_MODEL || 'claude-sonnet-5',
  // The schema asks for a concept, a caption, fifteen hashtags, the claims and
  // up to ten slides. 2048 truncated that mid-object, which surfaced as
  // "malformed JSON" rather than as the length problem it was.
  POST_AGENT_MAX_TOKENS: Number(process.env.POST_AGENT_MAX_TOKENS) || 8192,
  // A copy attempt that fails schema or brand validation is retried with the
  // validator's complaint appended. Beyond this the draft is marked failed.
  POST_AGENT_MAX_ATTEMPTS: Number(process.env.POST_AGENT_MAX_ATTEMPTS) || 3,
  // The SDK default is ten minutes, which is a sensible ceiling for a long
  // generation and far too long for a few hundred words of post copy — a stalled
  // request should be abandoned and retried, not waited out.
  POST_AGENT_TIMEOUT_MS: Number(process.env.POST_AGENT_TIMEOUT_MS) || 90000,
  POST_AGENT_RETRIES: Number(process.env.POST_AGENT_RETRIES ?? 1),
  // A hard ceiling on the whole copy stage. Attempts stop once it is spent,
  // whatever the retry maths would otherwise allow.
  POST_AGENT_BUDGET_MS: Number(process.env.POST_AGENT_BUDGET_MS) || 240000,
  // A rendered draft is queued into its posting slot immediately, held in review.
  // Nothing publishes until a human approves, which releases it to the cron.
  POST_AUTO_SCHEDULE: process.env.POST_AUTO_SCHEDULE !== 'false',
  POST_DEFAULT_PLATFORM: process.env.POST_DEFAULT_PLATFORM || 'instagram',
  POST_DEFAULT_PAGE_ID: process.env.POST_DEFAULT_PAGE_ID || '',
  // Weekdays as 0=Sunday..6=Saturday. Tuesday and Friday by default.
  POST_SLOT_WEEKDAYS: process.env.POST_SLOT_WEEKDAYS || '2,5',
  POST_SLOT_HOUR: Number(process.env.POST_SLOT_HOUR ?? 9),

  // Autopilot: the agents draft and queue for workspaces whose switch is set to
  // autopilot. Each group produces its batch once per posting day, so the tick
  // only has to be frequent enough to catch the slot.
  AUTOPILOT_ENABLED: process.env.AUTOPILOT_ENABLED !== 'false',
  CRON_SCHEDULE_AUTOPILOT: process.env.CRON_SCHEDULE_AUTOPILOT || '0 * * * *',
  // A run outliving this is treated as abandoned — the process that owned it
  // almost certainly died. Generous: a slide render can genuinely take minutes.
  AUTOPILOT_MAX_RUN_MINUTES: Number(process.env.AUTOPILOT_MAX_RUN_MINUTES) || 30,
  // How long a failed run keeps the working state that lets it resume instead of
  // starting over. Past this the copy is gone and the run has to be redone.
  AGENT_RUN_STATE_TTL_SECONDS: Number(process.env.AGENT_RUN_STATE_TTL_SECONDS) || 86400,

  // Analytics pull: one sweep an hour reads back what the platforms report for
  // recently published posts, plus a daily follower snapshot per account.
  ANALYTICS_PULL_ENABLED: process.env.ANALYTICS_PULL_ENABLED !== 'false',
  CRON_SCHEDULE_ANALYTICS_PULL: process.env.CRON_SCHEDULE_ANALYTICS_PULL || '20 * * * *',
  // Meta allows 200 calls per user per hour; this stays well under it so a
  // sweep can never starve publishing, which shares the same quota.
  ANALYTICS_PULL_CALL_BUDGET: Number(process.env.ANALYTICS_PULL_CALL_BUDGET) || 120,
  ANALYTICS_PULL_POST_LIMIT: Number(process.env.ANALYTICS_PULL_POST_LIMIT) || 100,
  ANALYTICS_PULL_ACCOUNT_LIMIT: Number(process.env.ANALYTICS_PULL_ACCOUNT_LIMIT) || 50,
  // Meta reports quota use as a percentage; past this the sweep stops early and
  // picks up on the next tick rather than earning a block.
  ANALYTICS_PULL_USAGE_CEILING: Number(process.env.ANALYTICS_PULL_USAGE_CEILING) || 80,

  // Notify (transactional notifications and campaigns). No key switches every send off.
  NOTIFY_API_KEY: process.env.NOTIFY_API_KEY || '',
  NOTIFY_REVIEW_CHANNELS: (process.env.NOTIFY_REVIEW_CHANNELS || 'in_app,email')
    .split(',')
    .map(channel => channel.trim())
    .filter(Boolean),
  NOTIFY_DEDUPE_TTL_SECONDS: Number(process.env.NOTIFY_DEDUPE_TTL_SECONDS) || 86400,
  DASHBOARD_URL: process.env.DASHBOARD_URL || 'http://localhost:5173',
  POST_REVIEW_TEMPLATE: process.env.POST_REVIEW_TEMPLATE || 'd35e667f-f314-4fb8-b61b-32eb4cef4bee',

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
