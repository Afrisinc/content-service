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
} as const;
