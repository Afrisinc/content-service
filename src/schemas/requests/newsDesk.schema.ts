import { NEWS_ARTICLE_STATUSES, NEWS_BATCH_SIZE_OPTIONS } from '@/types/newsDesk.types';

const articleIdParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', pattern: '^[0-9]+$' } },
};

export const ListNewsDeskArticlesSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: [...NEWS_ARTICLE_STATUSES] },
      category: { type: 'string', maxLength: 100 },
      search: { type: 'string', maxLength: 200 },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
};

export const GetNewsDeskArticleSchema = { params: articleIdParams };

export const NewsDeskArticleActionSchema = { params: articleIdParams };

export const RunNewsAgentStageSchema = {
  params: {
    type: 'object',
    required: ['stage'],
    properties: { stage: { type: 'string', enum: ['ingest', 'enhance'] } },
  },
};

export const UpdateNewsDeskSettingsSchema = {
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['batchSize'],
    properties: { batchSize: { type: 'integer', enum: [...NEWS_BATCH_SIZE_OPTIONS] } },
  },
};

export const FeatureNewsDeskArticleSchema = {
  params: articleIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['featured'],
    properties: { featured: { type: 'boolean' } },
  },
};
