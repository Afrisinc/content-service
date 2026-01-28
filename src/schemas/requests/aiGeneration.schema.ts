/**
 * AI Generation Request Schemas
 * Fastify JSON schemas for AI content generation endpoints
 */

export const GeneratePostSchema = {
  description: 'Generate social media posts using external AI Agent service',
  tags: ['ai-generation'],
  body: {
    type: 'object',
    required: ['topic'],
    properties: {
      topic: {
        type: 'string',
        minLength: 1,
        maxLength: 500,
        description: 'Topic for post generation',
      },
      'Keywords or Hashtags (optional)': {
        type: 'string',
        description: 'Keywords or hashtags to include (optional)',
      },
      'Link (optional)': {
        type: 'string',
        format: 'uri',
        description: 'Link to include in the post (optional)',
      },
      submittedAt: {
        type: 'string',
        format: 'date-time',
        description: 'ISO 8601 timestamp of submission (optional, defaults to current time)',
      },
      formMode: {
        type: 'string',
        enum: ['test', 'production'],
        default: 'production',
        description: 'Mode of operation - test or production',
      },
    },
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        message: {
          type: 'string',
        },
        data: {
          description: 'Generated posts data from AI Agent service',
        },
      },
    },
    400: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
    500: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        error: { type: 'string' },
      },
    },
  },
};

export const GeneratePostForPlatformSchema = {
  description: 'Generate post for a specific platform',
  tags: ['ai-generation'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['prompt', 'platform'],
    properties: {
      prompt: {
        type: 'string',
        minLength: 10,
        maxLength: 2000,
        description: 'Content prompt for AI generation',
      },
      platform: {
        type: 'string',
        enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
        description: 'Target platform',
      },
      tone: {
        type: 'string',
        enum: ['professional', 'casual', 'humorous', 'promotional'],
        default: 'professional',
      },
      maxLength: {
        type: 'integer',
        minimum: 100,
        maximum: 2000,
        default: 500,
      },
      includeEmojis: {
        type: 'boolean',
        default: true,
      },
      includeHashtags: {
        type: 'boolean',
        default: true,
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            platform: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                model: { type: 'string' },
                provider: { type: 'string' },
                tokensUsed: { type: 'number' },
              },
            },
          },
        },
      },
    },
  },
};

export const PublishScheduledPostsSchema = {
  description: 'Publish all scheduled posts that are due',
  tags: ['ai-generation'],
  security: [{ bearerAuth: [] }],
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'object',
          properties: {
            published: { type: 'number' },
            failed: { type: 'number' },
            errors: {
              type: 'array',
              items: { type: 'string' },
            },
          },
        },
      },
    },
  },
};

export const GetGenerationHistorySchema = {
  description: 'Get user AI generation history',
  tags: ['ai-generation'],
  security: [{ bearerAuth: [] }],
  querystring: {
    type: 'object',
    properties: {
      limit: {
        type: 'integer',
        default: 10,
        minimum: 1,
        maximum: 100,
        description: 'Number of results to return',
      },
      offset: {
        type: 'integer',
        default: 0,
        minimum: 0,
        description: 'Number of results to skip',
      },
    },
  },
  response: {
    200: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        message: { type: 'string' },
        data: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              platform: { type: 'string' },
              message: { type: 'string' },
              aiGenerated: { type: 'boolean' },
              aiProvider: { type: 'string' },
              status: { type: 'string' },
              createdAt: { type: 'string' },
            },
          },
        },
        count: { type: 'number' },
      },
    },
  },
};
