/**
 * AI Generation Request Schemas
 * Fastify JSON schemas for AI content generation endpoints
 */

export const GeneratePostSchema = {
  description: 'Generate social media posts using AI',
  tags: ['ai-generation'],
  security: [{ bearerAuth: [] }],
  body: {
    type: 'object',
    required: ['prompt', 'platforms'],
    properties: {
      prompt: {
        type: 'string',
        minLength: 10,
        maxLength: 2000,
        description: 'Content prompt for AI generation',
      },
      platforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
        },
        minItems: 1,
        maxItems: 5,
        description: 'Target social media platforms',
      },
      tone: {
        type: 'string',
        enum: ['professional', 'casual', 'humorous', 'promotional'],
        default: 'professional',
        description: 'Content tone',
      },
      includeEmojis: {
        type: 'boolean',
        default: true,
        description: 'Include emojis in generated content',
      },
      includeHashtags: {
        type: 'boolean',
        default: true,
        description: 'Include hashtags in generated content',
      },
      maxLength: {
        type: 'integer',
        minimum: 100,
        maximum: 2000,
        default: 500,
        description: 'Maximum character length for content',
      },
      language: {
        type: 'string',
        default: 'en',
        description: 'Language code for content generation',
      },
      scheduleFor: {
        type: 'string',
        format: 'date-time',
        description:
          'ISO 8601 timestamp for scheduling post publication (optional)',
      },
      includeImage: {
        type: 'boolean',
        default: false,
        description: 'Generate image using DALL-E 3 when true (optional)',
      },
      imageStyle: {
        type: 'string',
        enum: ['realistic', 'cartoon', 'abstract', 'minimalist'],
        default: 'realistic',
        description:
          'Style for AI-generated image (only used when includeImage is true)',
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
          type: 'object',
          properties: {
            postIds: {
              type: 'array',
              items: { type: 'string' },
              description: 'Generated post IDs',
            },
            platforms: {
              type: 'array',
              items: { type: 'string' },
              description: 'Platforms with generated content',
            },
            content: {
              type: 'object',
              additionalProperties: { type: 'string' },
              description: 'Generated content by platform',
            },
            scheduledFor: {
              type: 'string',
              format: 'date-time',
              description: 'Scheduled publication time if applicable',
            },
            hashtags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Recommended hashtags',
            },
            imageUrl: {
              type: 'string',
              description:
                'URL of the image included in the post (if provided)',
            },
            imageCaption: {
              type: 'string',
              description:
                'AI-generated caption for the image (if image was provided)',
            },
            metadata: {
              type: 'object',
              properties: {
                model: { type: 'string' },
                provider: { type: 'string' },
                generationPrompt: { type: 'string' },
                timestamp: { type: 'string' },
                tokensUsed: { type: 'number' },
              },
            },
          },
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
