/**
 * Social Media Post Request Schemas
 * Validation schemas for social media posting endpoints
 */

export const FacebookPostPayloadSchema = {
  type: 'object',
  required: ['platform', 'pageId', 'content', 'accessToken'],
  properties: {
    platform: {
      type: 'string',
      enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
      description: 'Social media platform',
    },
    pageId: {
      type: 'string',
      description: 'Facebook Page ID or account ID',
      minLength: 1,
    },
    content: {
      type: 'object',
      description: 'Post content',
      properties: {
        message: {
          type: 'string',
          description: 'Main post message/text',
          maxLength: 63206,
        },
        link: {
          type: 'string',
          format: 'uri',
          description: 'URL to link in the post',
        },
        description: {
          type: 'string',
          description: 'Description for the link',
          maxLength: 4000,
        },
        picture: {
          type: 'string',
          format: 'uri',
          description: 'Image URL for the post',
        },
        name: {
          type: 'string',
          description: 'Name/title for the link',
          maxLength: 100,
        },
        caption: {
          type: 'string',
          description: 'Caption for the picture/link',
          maxLength: 1000,
        },
        tags: {
          type: 'array',
          items: {
            type: 'string',
          },
          description: 'Tags to include in the post',
          maxItems: 50,
        },
      },
    },
    media: {
      type: 'object',
      description: 'Media attachments',
      properties: {
        type: {
          type: 'string',
          enum: ['image', 'video', 'carousel'],
          description: 'Type of media',
        },
        url: {
          type: 'string',
          format: 'uri',
          description: 'Single media URL',
        },
        urls: {
          type: 'array',
          items: {
            type: 'string',
            format: 'uri',
          },
          description: 'Multiple media URLs for carousel',
          maxItems: 20,
        },
        alt_text: {
          type: 'string',
          description: 'Alternative text for accessibility',
          maxLength: 500,
        },
      },
    },
    scheduling: {
      type: 'object',
      description: 'Scheduling options',
      properties: {
        scheduled_publish_time: {
          type: 'number',
          description: 'Unix timestamp for scheduled publishing',
        },
        publish_immediately: {
          type: 'boolean',
          description: 'Publish immediately instead of scheduling',
        },
      },
    },
    targeting: {
      type: 'object',
      description: 'Audience targeting (for ads)',
      properties: {
        age_min: {
          type: 'number',
          minimum: 13,
          maximum: 120,
        },
        age_max: {
          type: 'number',
          minimum: 13,
          maximum: 120,
        },
        genders: {
          type: 'array',
          items: {
            type: 'number',
            enum: [0, 1, 2], // 1: male, 2: female, 0: all
          },
        },
        countries: {
          type: 'array',
          items: {
            type: 'string',
          },
          maxItems: 50,
        },
        regions: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        cities: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        locales: {
          type: 'array',
          items: {
            type: 'number',
          },
        },
        interests: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
        keywords: {
          type: 'array',
          items: {
            type: 'string',
          },
        },
      },
    },
    metadata: {
      type: 'object',
      description: 'Optional metadata for tracking',
      properties: {
        aiGenerated: {
          type: 'boolean',
        },
        generatedBy: {
          type: 'string',
          maxLength: 255,
        },
        generationPrompt: {
          type: 'string',
          maxLength: 2000,
        },
        timestamp: {
          type: 'string',
          format: 'date-time',
        },
      },
    },
    accessToken: {
      type: 'string',
      description: 'Facebook Page Access Token',
      minLength: 1,
    },
  },
  additionalProperties: false,
};

export const PostToSocialMediaSchema = {
  description: 'Post content to social media platforms',
  tags: ['social-media'],
  body: FacebookPostPayloadSchema,
  response: {
    200: {
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
            platform: {
              type: 'string',
            },
            postId: {
              type: 'string',
            },
            status: {
              type: 'string',
              enum: ['success', 'pending', 'failed'],
            },
            publishedAt: {
              type: 'string',
              format: 'date-time',
            },
          },
        },
      },
    },
    400: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        message: {
          type: 'string',
        },
        error: {
          type: 'string',
        },
      },
    },
  },
};

export const GetSocialMediaPostSchema = {
  description: 'Get social media post details',
  tags: ['social-media'],
  params: {
    type: 'object',
    required: ['postId'],
    properties: {
      postId: {
        type: 'string',
        description: 'Social media post ID',
      },
    },
  },
  response: {
    200: {
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
        },
      },
    },
  },
};
