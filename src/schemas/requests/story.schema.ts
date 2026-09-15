const STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED'];

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

const storyEpisodeParams = {
  type: 'object',
  required: ['id', 'episodeId'],
  properties: {
    id: { type: 'string', format: 'uuid' },
    episodeId: { type: 'string', format: 'uuid' },
  },
};

export const CreateStorySchema = {
  body: {
    type: 'object',
    required: ['title', 'premise'],
    additionalProperties: false,
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 120 },
      premise: { type: 'string', minLength: 20, maxLength: 4000 },
      genre: { type: 'string', maxLength: 60 },
      language: { type: 'string', minLength: 2, maxLength: 12 },
      audience: { type: 'string', maxLength: 80 },
      tone: { type: 'string', maxLength: 120 },
      coverImageUrl: { type: 'string', format: 'uri', maxLength: 500 },
      groupId: { type: 'string', format: 'uuid' },
      autoPromote: { type: 'boolean' },
      autoApprovePromotion: { type: 'boolean' },
    },
  },
};

export const ListStoriesSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: STATUSES },
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
};

export const GetStorySchema = { params: idParams };

export const ListPublicStoriesSchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
};

export const GetPublicStorySchema = { params: idParams };

export const GetPublicStoryEpisodeSchema = {
  params: {
    type: 'object',
    required: ['id', 'episodeNumber'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      episodeNumber: { type: 'string', pattern: '^[0-9]+$' },
    },
  },
};

export const RecordEpisodeViewSchema = { params: GetPublicStoryEpisodeSchema.params };
export const RecordEpisodeReadSchema = { params: GetPublicStoryEpisodeSchema.params };

export const GenerateEpisodeSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      instructions: { type: 'string', maxLength: 1000 },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 },
    },
  },
};

export const ListStoryEpisodesSchema = {
  params: idParams,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      page: { type: 'integer', minimum: 1 },
      limit: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
};

export const GetStoryEpisodeSchema = { params: storyEpisodeParams };
export const RegenerateEpisodeSchema = {
  params: storyEpisodeParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { instructions: { type: 'string', maxLength: 1000 } },
  },
};

export const ApproveStoryEpisodeSchema = { params: storyEpisodeParams };
export const PublishStoryEpisodeSchema = { params: storyEpisodeParams };
export const RetryPromotionSchema = { params: storyEpisodeParams };
