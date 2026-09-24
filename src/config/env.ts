import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is not configured`);
  }
  return value;
}

export const env = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || '',
  CONTENT_ENCRYPTION_KEY: process.env.CONTENT_ENCRYPTION_KEY || '',
  SERVICE_SECRET: requireEnv('SERVICE_SECRET'),
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL || 'gpt-4',
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
  OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
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

  NEWS_AGENT_ENABLED: process.env.NEWS_AGENT_ENABLED === 'true',
  CRON_SCHEDULE_NEWS_INGEST: process.env.CRON_SCHEDULE_NEWS_INGEST || '*/30 * * * *',
  CRON_SCHEDULE_NEWS_ENHANCE: process.env.CRON_SCHEDULE_NEWS_ENHANCE || '*/10 * * * *',
  NEWS_RSS_SOURCES: process.env.NEWS_RSS_SOURCES || '',
  NEWS_FEED_TIMEOUT_MS: Number(process.env.NEWS_FEED_TIMEOUT_MS) || 10000,
  NEWS_FEED_ITEM_LIMIT: Number(process.env.NEWS_FEED_ITEM_LIMIT) || 10,
  NEWS_ENHANCE_BATCH_SIZE: Number(process.env.NEWS_ENHANCE_BATCH_SIZE) || 5,
  NEWS_MIN_SCORE: Number(process.env.NEWS_MIN_SCORE ?? 0.6),
  NEWS_TEXT_MODEL: process.env.NEWS_TEXT_MODEL || 'gpt-4o',
  NEWS_IMAGE_MODEL: process.env.NEWS_IMAGE_MODEL || 'dall-e-3',
  NEWS_IMAGE_SIZE: process.env.NEWS_IMAGE_SIZE || '1792x1024',
  NEWS_IMAGE_QUALITY: process.env.NEWS_IMAGE_QUALITY || 'hd',

  STORY_AGENT_ENABLED: process.env.STORY_AGENT_ENABLED !== 'false',
  CRON_SCHEDULE_STORY_AGENT: process.env.CRON_SCHEDULE_STORY_AGENT || '0 8 * * *',
  STORY_AGENT_INTERVAL_HOURS: Number(process.env.STORY_AGENT_INTERVAL_HOURS) || 24,
  STORY_AGENT_MAX_PER_RUN: Number(process.env.STORY_AGENT_MAX_PER_RUN) || 3,

  STORY_LLM_CHATGPT_MODEL: process.env.STORY_LLM_CHATGPT_MODEL || 'gpt-4o',
  STORY_LLM_CLAUDE_MODEL: process.env.STORY_LLM_CLAUDE_MODEL || 'claude-sonnet-5',
  STORY_LLM_MAX_TOKENS: Number(process.env.STORY_LLM_MAX_TOKENS) || 4096,
  STORY_LLM_TEMPERATURE: Number(process.env.STORY_LLM_TEMPERATURE ?? 0.85),
  STORY_LLM_MAX_ATTEMPTS: Number(process.env.STORY_LLM_MAX_ATTEMPTS) || 2,
  STORY_PUBLIC_BASE_URL: process.env.STORY_PUBLIC_BASE_URL || 'https://afrisinc.com/media/stories',

  STUDIO_ENABLED: process.env.STUDIO_ENABLED === 'true',
  STUDIO_WORKER_ROLE: process.env.STUDIO_WORKER_ROLE || 'all',
  STUDIO_PROMPTS_DIR: process.env.STUDIO_PROMPTS_DIR || '',
  STUDIO_REMOTION_DIR: process.env.STUDIO_REMOTION_DIR || 'remotion',
  STUDIO_REMOTION_CONCURRENCY: Number(process.env.STUDIO_REMOTION_CONCURRENCY) || 2,

  STUDIO_DEFAULT_LANGUAGE: process.env.STUDIO_DEFAULT_LANGUAGE || 'en',
  STUDIO_DEFAULT_VISUAL_STYLE:
    process.env.STUDIO_DEFAULT_VISUAL_STYLE || 'cinematic stylized 3D animation',
  STUDIO_DEFAULT_DURATION_SECONDS: Number(process.env.STUDIO_DEFAULT_DURATION_SECONDS) || 60,
  STUDIO_AUTO_APPROVE: process.env.STUDIO_AUTO_APPROVE === 'true',

  RABBITMQ_URL: process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
  RABBITMQ_HEARTBEAT_SECONDS: Number(process.env.RABBITMQ_HEARTBEAT_SECONDS) || 60,

  STUDIO_S3_ENDPOINT: process.env.STUDIO_S3_ENDPOINT || 'http://localhost:9000',
  STUDIO_S3_PUBLIC_URL: process.env.STUDIO_S3_PUBLIC_URL || '',
  STUDIO_S3_BUCKET: process.env.STUDIO_S3_BUCKET || 'animation-platform',
  STUDIO_S3_REGION: process.env.STUDIO_S3_REGION || 'us-east-1',
  STUDIO_S3_ACCESS_KEY: process.env.STUDIO_S3_ACCESS_KEY || '',
  STUDIO_S3_SECRET_KEY: process.env.STUDIO_S3_SECRET_KEY || '',
  STUDIO_S3_FORCE_PATH_STYLE: process.env.STUDIO_S3_FORCE_PATH_STYLE !== 'false',
  STUDIO_S3_SIGNED_URL_TTL_SECONDS: Number(process.env.STUDIO_S3_SIGNED_URL_TTL_SECONDS) || 21600,

  STUDIO_LLM_PROVIDER: process.env.STUDIO_LLM_PROVIDER || 'ollama',
  STUDIO_LLM_MODEL: process.env.STUDIO_LLM_MODEL || 'qwen2.5:14b-instruct',
  STUDIO_LLM_FALLBACK_MODEL: process.env.STUDIO_LLM_FALLBACK_MODEL || 'gpt-4o-mini',
  STUDIO_LLM_FALLBACK_BASE_URL: process.env.STUDIO_LLM_FALLBACK_BASE_URL || '',
  STUDIO_LLM_TIMEOUT_MS: Number(process.env.STUDIO_LLM_TIMEOUT_MS) || 300000,
  STUDIO_LLM_TEMPERATURE: Number(process.env.STUDIO_LLM_TEMPERATURE ?? 0.7),
  STUDIO_LLM_MAX_TOKENS: Number(process.env.STUDIO_LLM_MAX_TOKENS) || 8192,
  STUDIO_STRUCTURED_MAX_ATTEMPTS: Number(process.env.STUDIO_STRUCTURED_MAX_ATTEMPTS) || 3,
  OLLAMA_BASE_URL: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',

  COMFYUI_BASE_URL: process.env.COMFYUI_BASE_URL || 'http://localhost:8188',
  STUDIO_COMFY_WORKFLOW_DIR: process.env.STUDIO_COMFY_WORKFLOW_DIR || 'infra/comfyui/workflows',
  STUDIO_COMFY_DEFAULT_WORKFLOW: process.env.STUDIO_COMFY_DEFAULT_WORKFLOW || 'sdxl_character',
  STUDIO_IMAGE_STEPS: Number(process.env.STUDIO_IMAGE_STEPS) || 28,
  STUDIO_IMAGE_CFG: Number(process.env.STUDIO_IMAGE_CFG) || 6.5,
  STUDIO_IMAGE_TIMEOUT_MS: Number(process.env.STUDIO_IMAGE_TIMEOUT_MS) || 600000,
  STUDIO_IMAGE_POLL_MS: Number(process.env.STUDIO_IMAGE_POLL_MS) || 1500,
  STUDIO_CHARACTER_WIDTH: Number(process.env.STUDIO_CHARACTER_WIDTH) || 1024,
  STUDIO_CHARACTER_HEIGHT: Number(process.env.STUDIO_CHARACTER_HEIGHT) || 1536,
  STUDIO_ENVIRONMENT_WIDTH: Number(process.env.STUDIO_ENVIRONMENT_WIDTH) || 1920,
  STUDIO_ENVIRONMENT_HEIGHT: Number(process.env.STUDIO_ENVIRONMENT_HEIGHT) || 1088,

  MEDIA_WORKER_URL: process.env.MEDIA_WORKER_URL || 'http://localhost:8095',
  MEDIA_WORKER_API_KEY: process.env.MEDIA_WORKER_API_KEY || '',
  MEDIA_WORKER_TIMEOUT_MS: Number(process.env.MEDIA_WORKER_TIMEOUT_MS) || 1800000,
  STUDIO_TTS_TIMEOUT_MS: Number(process.env.STUDIO_TTS_TIMEOUT_MS) || 300000,
  STUDIO_STT_TIMEOUT_MS: Number(process.env.STUDIO_STT_TIMEOUT_MS) || 600000,
  STUDIO_DEFAULT_VOICE: process.env.STUDIO_DEFAULT_VOICE || 'af_heart',
  STUDIO_LINE_GAP_SECONDS: Number(process.env.STUDIO_LINE_GAP_SECONDS ?? 0.35),

  STUDIO_MASTER_FPS: Number(process.env.STUDIO_MASTER_FPS) || 30,
  STUDIO_TARGET_LUFS: Number(process.env.STUDIO_TARGET_LUFS ?? -14),
  STUDIO_SCENE_RENDER_TIMEOUT_SECONDS:
    Number(process.env.STUDIO_SCENE_RENDER_TIMEOUT_SECONDS) || 5400,
  STUDIO_THUMBNAIL_CANDIDATES: Number(process.env.STUDIO_THUMBNAIL_CANDIDATES) || 5,
  STUDIO_WATERMARK_KEY: process.env.STUDIO_WATERMARK_KEY || '',
  STUDIO_QA_MAX_BLACK_RATIO: Number(process.env.STUDIO_QA_MAX_BLACK_RATIO ?? 0.02),
  STUDIO_QA_MAX_SILENCE_RATIO: Number(process.env.STUDIO_QA_MAX_SILENCE_RATIO ?? 0.35),

  STUDIO_VIDEO_PROVIDER: process.env.STUDIO_VIDEO_PROVIDER || 'comfyui-wan',
  STUDIO_VIDEO_MODEL: process.env.STUDIO_VIDEO_MODEL || 'wan2.2-t2v-a14b',
  STUDIO_WAN_T2V_WORKFLOW: process.env.STUDIO_WAN_T2V_WORKFLOW || 'wan22_t2v',
  STUDIO_WAN_I2V_WORKFLOW: process.env.STUDIO_WAN_I2V_WORKFLOW || 'wan22_i2v',
  STUDIO_VIDEO_WIDTH: Number(process.env.STUDIO_VIDEO_WIDTH) || 1280,
  STUDIO_VIDEO_HEIGHT: Number(process.env.STUDIO_VIDEO_HEIGHT) || 720,
  STUDIO_VIDEO_FPS: Number(process.env.STUDIO_VIDEO_FPS) || 16,
  STUDIO_VIDEO_STEPS: Number(process.env.STUDIO_VIDEO_STEPS) || 20,
  STUDIO_VIDEO_CFG: Number(process.env.STUDIO_VIDEO_CFG ?? 3.5),
  STUDIO_VIDEO_MAX_FRAMES: Number(process.env.STUDIO_VIDEO_MAX_FRAMES) || 81,
  STUDIO_VIDEO_TIMEOUT_MS: Number(process.env.STUDIO_VIDEO_TIMEOUT_MS) || 1800000,
  STUDIO_VIDEO_POLL_MS: Number(process.env.STUDIO_VIDEO_POLL_MS) || 3000,
  STUDIO_VIDEO_CONTINUITY: process.env.STUDIO_VIDEO_CONTINUITY !== 'false',
  STUDIO_VIDEO_PREVIEW_ENABLED: process.env.STUDIO_VIDEO_PREVIEW_ENABLED === 'true',

  YOUTUBE_CLIENT_ID: process.env.YOUTUBE_CLIENT_ID || '',
  YOUTUBE_CLIENT_SECRET: process.env.YOUTUBE_CLIENT_SECRET || '',
  YOUTUBE_DEFAULT_CATEGORY_ID: process.env.YOUTUBE_DEFAULT_CATEGORY_ID || '1',
} as const;
