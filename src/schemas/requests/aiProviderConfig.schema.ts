import { AI_PROVIDERS, AI_PURPOSES } from '@/types/aiProviderConfig.types';

const ConfigParamsSchema = {
  type: 'object',
  required: ['provider', 'purpose'],
  properties: {
    provider: { type: 'string', enum: [...AI_PROVIDERS] },
    purpose: { type: 'string', enum: [...AI_PURPOSES] },
  },
};

const ConfigSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    provider: { type: 'string', enum: [...AI_PROVIDERS] },
    purpose: { type: 'string', enum: [...AI_PURPOSES] },
    model: { type: 'string', nullable: true, default: null },
    baseUrl: { type: 'string', nullable: true, default: null },
    organizationId: { type: 'string', nullable: true, default: null },
    projectId: { type: 'string', nullable: true, default: null },
    apiKeyHint: { type: 'string' },
    isActive: { type: 'boolean' },
    lastRotatedAt: { type: 'string', format: 'date-time' },
    updatedBy: { type: 'string', nullable: true, default: null },
    updatedAt: { type: 'string', format: 'date-time' },
  },
};

const ErrorResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', default: false },
    resp_msg: { type: 'string' },
    resp_code: { type: 'number' },
  },
};

export const ListAiProviderConfigsSchema = {
  description: 'List AI provider configurations. API keys are never returned, only a masked hint.',
  tags: ['ai-provider-configs'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        resp_msg: { type: 'string' },
        resp_code: { type: 'number' },
        data: {
          type: 'object',
          properties: {
            configs: { type: 'array', items: ConfigSchema, default: [] },
          },
        },
      },
    },
    401: ErrorResponseSchema,
    403: ErrorResponseSchema,
  },
};

export const SaveAiProviderConfigSchema = {
  description:
    'Create or update the AI provider configuration for a provider and purpose. ' +
    'apiKey is required on creation and, when sent later, rotates the stored key.',
  tags: ['ai-provider-configs'],
  security: [{ bearerAuth: [] }],
  params: ConfigParamsSchema,
  body: {
    type: 'object',
    properties: {
      apiKey: { type: 'string', minLength: 8, maxLength: 500 },
      model: { type: 'string', nullable: true, minLength: 1, maxLength: 255 },
      baseUrl: { type: 'string', nullable: true, minLength: 1, maxLength: 1000, format: 'uri' },
      organizationId: { type: 'string', nullable: true, minLength: 1, maxLength: 255 },
      projectId: { type: 'string', nullable: true, minLength: 1, maxLength: 255 },
      isActive: { type: 'boolean' },
    },
    additionalProperties: false,
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        resp_msg: { type: 'string' },
        resp_code: { type: 'number' },
        data: ConfigSchema,
      },
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
    403: ErrorResponseSchema,
  },
};
