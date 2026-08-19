export const CHATGPT_NODE_NAME = 'chatGpt';
export const CHATGPT_CREDENTIALS_NAME = 'chatGptApi';

export const CHATGPT_RESOURCE = {
  TEXT: 'text',
  IMAGE: 'image',
  EMBEDDING: 'embedding',
} as const;

export const CHATGPT_OPERATION = {
  MESSAGE: 'message',
  CLASSIFY: 'classify',
  GENERATE: 'generate',
  ANALYZE: 'analyze',
  CREATE: 'create',
} as const;

export type ChatGptResource = (typeof CHATGPT_RESOURCE)[keyof typeof CHATGPT_RESOURCE];
export type ChatGptOperation = (typeof CHATGPT_OPERATION)[keyof typeof CHATGPT_OPERATION];

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_CHAT_MODEL = 'gpt-4o-mini';
export const DEFAULT_VISION_MODEL = 'gpt-4o-mini';
export const DEFAULT_IMAGE_MODEL = 'dall-e-3';
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';
export const DEFAULT_MODERATION_MODEL = 'omni-moderation-latest';
export const DEFAULT_REQUEST_TIMEOUT_MS = 60000;

/** Listed for convenience only — `allowCustomValue` keeps newer model ids usable. */
export const CHAT_MODEL_OPTIONS = [
  { name: 'GPT-4o Mini', value: 'gpt-4o-mini' },
  { name: 'GPT-4o', value: 'gpt-4o' },
  { name: 'GPT-4.1', value: 'gpt-4.1' },
  { name: 'GPT-4.1 Mini', value: 'gpt-4.1-mini' },
  { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
  { name: 'GPT-3.5 Turbo', value: 'gpt-3.5-turbo' },
];

export const IMAGE_MODEL_OPTIONS = [
  { name: 'DALL-E 3', value: 'dall-e-3' },
  { name: 'DALL-E 2', value: 'dall-e-2' },
  { name: 'GPT Image 1', value: 'gpt-image-1' },
];

export const EMBEDDING_MODEL_OPTIONS = [
  { name: 'Text Embedding 3 Small', value: 'text-embedding-3-small' },
  { name: 'Text Embedding 3 Large', value: 'text-embedding-3-large' },
  { name: 'Text Embedding Ada 002', value: 'text-embedding-ada-002' },
];
