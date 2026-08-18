import { SOCIAL_PLATFORMS } from '@/types/socialMediaIntegration.types';

const PlatformParamsSchema = {
  type: 'object',
  required: ['platform'],
  properties: {
    platform: {
      type: 'string',
      enum: [...SOCIAL_PLATFORMS],
      description: 'Social media platform key',
    },
  },
};

const AccountSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    oauthState: { type: 'string' },
    name: { type: 'string' },
    meta: { type: 'string', nullable: true, default: null },
    scopes: { type: 'array', items: { type: 'string' }, default: [] },
    createdAt: { type: 'string', format: 'date-time' },
  },
};

const IntegrationSchema = {
  type: 'object',
  properties: {
    platform: { type: 'string', enum: [...SOCIAL_PLATFORMS] },
    appId: { type: 'string', nullable: true, default: null },
    connected: { type: 'boolean', default: false },
    syncedAt: { type: 'string', format: 'date-time', nullable: true, default: null },
    accounts: { type: 'array', items: AccountSchema, default: [] },
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

export const ListIntegrationsSchema = {
  description: 'List all social media platform integrations for the authenticated user',
  tags: ['social-media-integrations'],
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
            platforms: { type: 'array', items: IntegrationSchema, default: [] },
          },
        },
      },
    },
    401: ErrorResponseSchema,
  },
};

export const SaveIntegrationCredentialsSchema = {
  description: 'Save app credentials for a social media platform integration (creates or replaces)',
  tags: ['social-media-integrations'],
  security: [{ bearerAuth: [] }],
  params: PlatformParamsSchema,
  body: {
    type: 'object',
    required: ['appId', 'appSecret'],
    properties: {
      appId: { type: 'string', minLength: 1, maxLength: 255 },
      appSecret: { type: 'string', minLength: 1, maxLength: 500 },
      callbackUrl: { type: 'string', minLength: 1, maxLength: 1000, format: 'uri' },
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
        data: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: [...SOCIAL_PLATFORMS] },
            appId: { type: 'string' },
            callbackUrl: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
  },
};

export const UpdateIntegrationCredentialsSchema = {
  description:
    'Update app credentials for an existing social media platform integration. appSecret and callbackUrl are optional — omit to keep the current ones.',
  tags: ['social-media-integrations'],
  security: [{ bearerAuth: [] }],
  params: PlatformParamsSchema,
  body: {
    type: 'object',
    required: ['appId'],
    properties: {
      appId: { type: 'string', minLength: 1, maxLength: 255 },
      appSecret: { type: 'string', minLength: 1, maxLength: 500 },
      callbackUrl: { type: 'string', minLength: 1, maxLength: 1000, format: 'uri' },
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
        data: {
          type: 'object',
          properties: {
            platform: { type: 'string', enum: [...SOCIAL_PLATFORMS] },
            appId: { type: 'string' },
            callbackUrl: { type: 'string', nullable: true },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    401: ErrorResponseSchema,
    404: ErrorResponseSchema,
  },
};

export const AddSocialMediaAccountSchema = {
  description:
    'Add a connected account under a platform integration. Requires app credentials to already be saved.',
  tags: ['social-media-integrations'],
  security: [{ bearerAuth: [] }],
  params: PlatformParamsSchema,
  body: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 1, maxLength: 255 },
      meta: { type: 'string', maxLength: 255, default: '' },
      scopes: {
        type: 'array',
        items: { type: 'string', maxLength: 100 },
        maxItems: 20,
        default: [],
      },
      accessToken: { type: 'string', minLength: 1, maxLength: 1000 },
      expiresIn: { type: 'number', minimum: 0 },
    },
    additionalProperties: false,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: { type: 'boolean', default: true },
        resp_msg: { type: 'string' },
        resp_code: { type: 'number' },
        data: AccountSchema,
      },
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
  },
};

export const OAuthCallbackSchema = {
  description: 'OAuth callback endpoint to exchange authorization code for access tokens',
  tags: ['social-media-integrations'],
  params: PlatformParamsSchema,
  querystring: {
    type: 'object',
    required: ['code', 'state'],
    properties: {
      code: { type: 'string', minLength: 1 },
      state: { type: 'string', minLength: 1 },
    },
  },
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
            accountId: { type: 'string' },
            platform: { type: 'string', enum: [...SOCIAL_PLATFORMS] },
            connected: { type: 'boolean', default: true },
            expiresAt: { type: 'string', format: 'date-time' },
            pages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  access_token: { type: 'string', nullable: true },
                  category: { type: 'string', nullable: true },
                },
              },
              default: [],
            },
          },
        },
      },
    },
    400: ErrorResponseSchema,
  },
};

export const AvailablePagesSchema = {
  description: 'Get available and connected pages for a social media platform',
  tags: ['social-media-integrations'],
  security: [{ bearerAuth: [] }],
  params: PlatformParamsSchema,
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
            available: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  access_token: { type: 'string', nullable: true },
                  category: { type: 'string', nullable: true },
                },
              },
              default: [],
            },
            connected: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  access_token: { type: 'string', nullable: true },
                  category: { type: 'string', nullable: true },
                },
              },
              default: [],
            },
          },
        },
      },
    },
    400: ErrorResponseSchema,
    401: ErrorResponseSchema,
  },
};
