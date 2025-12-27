/**
 * Social Media Routes
 * Defines all endpoints for social media operations
 */

import { FastifyInstance } from 'fastify';
import {
  postToSocialMedia,
  getSocialMediaPost,
  deleteSocialMediaPost,
  batchPostToSocialMedia,
  validateSocialMediaPayload,
} from '../controllers/socialMedia.controller';
import {
  PostToSocialMediaSchema,
  GetSocialMediaPostSchema,
} from '@/schemas/requests/socialMedia.schema';

export async function socialMediaRoutes(app: FastifyInstance) {
  // POST: Create a new social media post
  app.post(
    '/social-media/post',
    {
      schema: {
        ...PostToSocialMediaSchema,
        description: 'Post content to social media platform',
      },
    },
    postToSocialMedia
  );

  // POST: Batch post to multiple platforms
  app.post(
    '/social-media/batch',
    {
      schema: {
        description: 'Post to multiple platforms in a single request',
        tags: ['social-media'],
        body: {
          type: 'array',
          items: PostToSocialMediaSchema.body,
          description: 'Array of social media post requests',
          minItems: 1,
          maxItems: 10,
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
                  results: {
                    type: 'array',
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
        },
      },
    },
    batchPostToSocialMedia
  );

  // GET: Retrieve post details
  app.get(
    '/social-media/posts/:postId',
    {
      schema: {
        ...GetSocialMediaPostSchema,
        description: 'Get details of a published social media post',
      },
    },
    getSocialMediaPost
  );

  // DELETE: Remove a posted social media post
  app.delete(
    '/social-media/posts/:postId',
    {
      schema: {
        description: 'Delete a published social media post',
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
        querystring: {
          type: 'object',
          required: ['accessToken', 'platform'],
          properties: {
            accessToken: {
              type: 'string',
              description: 'Platform access token',
            },
            platform: {
              type: 'string',
              enum: ['facebook', 'instagram', 'twitter', 'linkedin', 'tiktok'],
              description: 'Social media platform',
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
            },
          },
        },
      },
    },
    deleteSocialMediaPost
  );

  // POST: Validate payload without posting
  app.post(
    '/social-media/validate',
    {
      schema: {
        description: 'Validate social media post payload without posting',
        tags: ['social-media'],
        body: PostToSocialMediaSchema.body,
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
      },
    },
    validateSocialMediaPayload
  );
}
