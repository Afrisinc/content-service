/**
 * Social Media Post Request Schemas
 * Validation schemas for social media posting endpoints
 */

export const FacebookPostPayloadSchema = {
  type: 'object',
  required: ['platform', 'pageId', 'content'],
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
    format: {
      type: 'string',
      enum: ['feed', 'story', 'reel'],
      default: 'feed',
      description: 'Where the post is published: the feed, a 24-hour story, or a reel',
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
      description:
        '[DEPRECATED] Not required - token is fetched from database using platform + pageId',
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
    201: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        resp_msg: {
          type: 'string',
        },
        resp_code: {
          type: 'integer',
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
            message: {
              type: 'string',
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
        resp_msg: {
          type: 'string',
        },
        resp_code: {
          type: 'integer',
        },
        data: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
            },
          },
        },
      },
    },
  },
};

export const BatchPostToSocialMediaSchema = {
  description: 'Batch post content to social media platforms',
  tags: ['social-media'],
  body: {
    type: 'array',
    items: FacebookPostPayloadSchema,
    minItems: 1,
  },
  response: {
    201: {
      type: 'object',
      properties: {
        success: {
          type: 'boolean',
        },
        resp_msg: {
          type: 'string',
        },
        resp_code: {
          type: 'integer',
        },
        data: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  platform: { type: 'string' },
                  postId: { type: 'string' },
                  status: { type: 'string', enum: ['success', 'pending', 'failed'] },
                },
              },
            },
            summary: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                success: { type: 'number' },
                failed: { type: 'number' },
              },
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

export const ListSocialMediaPostsSchema = {
  description: 'List all social media posts with filtering',
  tags: ['social-media'],
  querystring: {
    type: 'object',
    properties: {
      platform: {
        type: 'string',
        enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
        description: 'Filter by platform',
      },
      status: {
        type: 'string',
        enum: ['pending', 'published', 'failed', 'deleted'],
        description: 'Filter by status',
      },
      limit: {
        type: 'number',
        minimum: 1,
        maximum: 100,
        default: 20,
        description: 'Number of posts to return',
      },
      offset: {
        type: 'number',
        minimum: 0,
        default: 0,
        description: 'Number of posts to skip',
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
          properties: {
            posts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  userId: { type: 'string' },
                  mediaPostId: { type: ['string', 'null'] },
                  platform: { type: 'string' },
                  pageId: { type: 'string' },
                  postId: { type: ['string', 'null'] },
                  postUrl: { type: ['string', 'null'] },
                  message: { type: ['string', 'null'] },
                  link: { type: ['string', 'null'] },
                  description: { type: ['string', 'null'] },
                  picture: { type: ['string', 'null'] },
                  name: { type: ['string', 'null'] },
                  caption: { type: ['string', 'null'] },
                  tags: { type: 'array', items: { type: 'string' } },
                  postFormat: { type: ['string', 'null'] },
                  mediaType: { type: ['string', 'null'] },
                  mediaUrls: { type: 'array', items: { type: 'string' } },
                  altText: { type: ['string', 'null'] },
                  scheduledAt: { type: ['string', 'null'], format: 'date-time' },
                  publishedAt: { type: ['string', 'null'], format: 'date-time' },
                  ageMin: { type: ['number', 'null'] },
                  ageMax: { type: ['number', 'null'] },
                  genders: { type: 'array', items: { type: 'number' } },
                  countries: { type: 'array', items: { type: 'string' } },
                  regions: { type: 'array', items: { type: 'string' } },
                  cities: { type: 'array', items: { type: 'string' } },
                  interests: { type: 'array', items: { type: 'string' } },
                  keywords: { type: 'array', items: { type: 'string' } },
                  aiGenerated: { type: 'boolean' },
                  aiProvider: { type: ['string', 'null'] },
                  aiModel: { type: ['string', 'null'] },
                  aiPrompt: { type: ['string', 'null'] },
                  status: { type: 'string' },
                  errorMessage: { type: ['string', 'null'] },
                  retryCount: { type: 'number' },
                  likes: { type: 'number' },
                  comments: { type: 'number' },
                  shares: { type: 'number' },
                  views: { type: 'number' },
                  reach: { type: 'number' },
                  impressions: { type: 'number' },
                  lastMetricsUpdate: { type: ['string', 'null'], format: 'date-time' },
                  metadata: { type: ['string', 'null'] },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                  user: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      email: { type: 'string' },
                      name: { type: ['string', 'null'] },
                    },
                  },
                },
              },
            },
            total: {
              type: 'number',
            },
            limit: {
              type: 'number',
            },
            offset: {
              type: 'number',
            },
          },
        },
      },
    },
  },
};

export const PublishScheduledPostSchema = {
  description: 'Publish a scheduled social media post immediately',
  tags: ['social-media'],
  params: {
    type: 'object',
    required: ['postId'],
    properties: {
      postId: {
        type: 'string',
        description: 'ID of the post to publish',
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
        resp_msg: {
          type: 'string',
        },
        resp_code: {
          type: 'integer',
        },
        data: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['success', 'failed'],
            },
            postId: {
              type: 'string',
            },
            platform: {
              type: 'string',
              enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
            },
            message: {
              type: 'string',
              description: 'Status message (success or error details)',
            },
            metadata: {
              type: 'object',
              description: 'Response metadata from platform',
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
        resp_msg: {
          type: 'string',
        },
        resp_code: {
          type: 'integer',
        },
        data: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['failed'],
            },
            message: {
              type: 'string',
              description: 'Error message',
            },
          },
        },
      },
    },
  },
};
