import 'dotenv/config';

export const env = {
  PORT: process.env.PORT || '3000',
  DATABASE_URL: process.env.DATABASE_URL || '',
  JWT_SECRET: process.env.JWT_SECRET || 'fallback-secret',
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
  OPENAI_TEXT_MODEL: process.env.OPENAI_TEXT_MODEL || 'gpt-4',
  OPENAI_IMAGE_MODEL: process.env.OPENAI_IMAGE_MODEL || 'dall-e-3',
} as const;
