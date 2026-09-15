const PLATFORMS = ['youtube', 'instagram', 'facebook', 'tiktok', 'linkedin', 'twitter'];
const FORMATS = ['LANDSCAPE_16_9', 'VERTICAL_9_16', 'PORTRAIT_4_5', 'SQUARE_1_1'];
const MODES = ['TWO_D', 'HYBRID', 'THREE_D'];
const PROFILES = ['PREVIEW', 'DRAFT', 'PRODUCTION', 'PREMIUM'];
const STAGES = ['STORY', 'ASSETS', 'FINAL_VIDEO', 'PUBLISHING'];
const STATUSES = [
  'DRAFT',
  'PLANNING',
  'SCRIPT_READY',
  'ASSETS_GENERATING',
  'ASSETS_READY',
  'AUDIO_GENERATING',
  'AUDIO_READY',
  'ANIMATION_READY',
  'RENDERING',
  'POST_PROCESSING',
  'QUALITY_CHECK',
  'APPROVED',
  'PUBLISHING',
  'PUBLISHED',
  'FAILED',
  'RETRYING',
  'CANCELLED',
];

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', format: 'uuid' } },
};

export const CreateProductionSchema = {
  body: {
    type: 'object',
    required: ['idea'],
    additionalProperties: false,
    properties: {
      idea: { type: 'string', minLength: 10, maxLength: 2000 },
      title: { type: 'string', maxLength: 120 },
      genre: { type: 'string', maxLength: 60 },
      language: { type: 'string', minLength: 2, maxLength: 12 },
      audience: { type: 'string', maxLength: 80 },
      visualStyle: { type: 'string', maxLength: 120 },
      narrationStyle: { type: 'string', maxLength: 120 },
      animationMode: { type: 'string', enum: MODES },
      targetDurationSeconds: { type: 'integer', minimum: 5, maximum: 1800 },
      platforms: { type: 'array', items: { type: 'string', enum: PLATFORMS }, maxItems: 6 },
      formats: { type: 'array', items: { type: 'string', enum: FORMATS }, maxItems: 4 },
      contentRestrictions: {
        type: 'array',
        items: { type: 'string', maxLength: 120 },
        maxItems: 20,
      },
      renderProfile: { type: 'string', enum: PROFILES },
      autoApprove: { type: 'boolean' },
      idempotencyKey: { type: 'string', minLength: 8, maxLength: 120 },
    },
  },
};

export const ListProductionsSchema = {
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

export const GetProductionSchema = { params: idParams };
export const StartProductionSchema = { params: idParams };
export const ProductionStatusSchema = { params: idParams };
export const ProductionEventsSchema = { params: idParams };
export const RetryProductionSchema = { params: idParams };

export const ApproveProductionSchema = {
  params: idParams,
  body: {
    type: 'object',
    required: ['stage'],
    additionalProperties: false,
    properties: { stage: { type: 'string', enum: STAGES } },
  },
};

export const RejectProductionSchema = {
  params: idParams,
  body: {
    type: 'object',
    required: ['stage', 'reason'],
    additionalProperties: false,
    properties: {
      stage: { type: 'string', enum: STAGES },
      reason: { type: 'string', minLength: 3, maxLength: 500 },
    },
  },
};

export const RerenderSceneSchema = {
  params: {
    type: 'object',
    required: ['id', 'sceneId'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      sceneId: { type: 'string', pattern: '^scene_\\d{3}$' },
    },
  },
};

export const PublishProductionSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { scheduledFor: { type: 'string', format: 'date-time' } },
  },
};

export const CancelProductionSchema = {
  params: idParams,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { reason: { type: 'string', maxLength: 500 } },
  },
};
