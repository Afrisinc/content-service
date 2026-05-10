/**
 * MediaPost Routes
 * Defines all endpoints for media post operations
 */

import { FastifyInstance } from 'fastify';

// Helper response schemas for array endpoints
const ArrayResponseSchema = {
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
          title: { type: 'string' },
          slug: { type: 'string' },
          excerpt: { type: 'string' },
          cover_image: { type: 'string' },
          status: { type: 'string' },
          views: { type: 'integer' },
          shares: { type: 'integer' },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
};
import {
  createMediaPost,
  n8nIngestMediaPost,
  getMediaPostById,
  getMediaPostBySlug,
  getMediaPosts,
  updateMediaPost,
  deleteMediaPost,
  archiveMediaPost,
  publishMediaPost,
  scheduleMediaPost,
  getFeaturedPosts,
  getBreakingNews,
  getByCategory,
  getByTopic,
  searchPosts,
  getAiGeneratedPosts,
  getNewsletterPosts,
  getVideoArticles,
  recordShare,
  getStatistics,
  bulkAction,
} from '../controllers/mediaPost.controller';
import {
  CreateMediaPostSchema,
  UpdateMediaPostSchema,
  GetMediaPostsQuerySchema,
  BulkMediaPostActionSchema,
} from '@/schemas/requests/mediaPost.schema';
import {
  PaginatedMediaPostResponseSchema,
  SingleMediaPostResponseSchema,
  MediaPostStatsResponseSchema,
  BulkActionResponseSchema,
} from '@/schemas/responses/mediaPost.schema';
import { authGuard } from '../middlewares/authGuard';

export async function mediaPostRoutes(app: FastifyInstance) {
  // POST: Create a new media post
  app.post(
    '/media-posts',
    {
      schema: {
        ...CreateMediaPostSchema,
        description: 'Create a new media post (article)',
        tags: ['media-posts'],
        response: {
          201: SingleMediaPostResponseSchema,
        },
      },
      onRequest: [authGuard],
    },
    createMediaPost
  );

  // POST: Ingest a media post from n8n workflow (no auth — internal automation)
  // Must be registered before /media-posts/:id to avoid route conflict
  app.post(
    '/media-posts/n8n-ingest',
    {
      schema: {
        ...CreateMediaPostSchema,
        description: 'Ingest a new AI-generated media post from n8n WF2 (no auth)',
        tags: ['media-posts'],
        response: {
          201: SingleMediaPostResponseSchema,
        },
      },
    },
    n8nIngestMediaPost
  );

  // GET: Get all media posts with pagination and filters
  app.get(
    '/media-posts',
    {
      schema: {
        querystring: GetMediaPostsQuerySchema,
        description: 'Get paginated media posts with filters',
        tags: ['media-posts'],
        response: {
          200: PaginatedMediaPostResponseSchema,
        },
      },
    },
    getMediaPosts
  );

  // GET: Get media post statistics
  app.get(
    '/media-posts/stats',
    {
      schema: {
        description: 'Get media post statistics and metrics',
        tags: ['media-posts'],
        response: {
          200: MediaPostStatsResponseSchema,
        },
      },
    },
    getStatistics
  );

  // GET: Get featured posts
  app.get(
    '/media-posts/featured',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        },
        description: 'Get featured media posts',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getFeaturedPosts
  );

  // GET: Get breaking news posts
  app.get(
    '/media-posts/breaking',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 5 },
          },
        },
        description: 'Get breaking news posts',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getBreakingNews
  );

  // GET: Get AI-generated posts
  app.get(
    '/media-posts/ai-generated',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        },
        description: 'Get AI-generated media posts',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getAiGeneratedPosts
  );

  // GET: Get newsletter posts
  app.get(
    '/media-posts/newsletter',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        },
        description: 'Get posts selected for newsletter',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getNewsletterPosts
  );

  // GET: Get video articles
  app.get(
    '/media-posts/videos',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        },
        description: 'Get articles with video media',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getVideoArticles
  );

  // GET: Get posts by category
  app.get(
    '/media-posts/category/:category',
    {
      schema: {
        params: {
          type: 'object',
          required: ['category'],
          properties: {
            category: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        },
        description: 'Get posts by category',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getByCategory
  );

  // GET: Get posts by topic
  app.get(
    '/media-posts/topic/:topic',
    {
      schema: {
        params: {
          type: 'object',
          required: ['topic'],
          properties: {
            topic: { type: 'string' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
          },
        },
        description: 'Get posts by topic',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    getByTopic
  );

  // GET: Search posts
  app.get(
    '/media-posts/search/:query',
    {
      schema: {
        params: {
          type: 'object',
          required: ['query'],
          properties: {
            query: { type: 'string', minLength: 1 },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          },
        },
        description: 'Search media posts',
        tags: ['media-posts'],
        response: {
          200: ArrayResponseSchema,
        },
      },
    },
    searchPosts
  );

  // GET: Get media post by ID
  app.get(
    '/media-posts/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        description: 'Get media post by ID',
        tags: ['media-posts'],
        response: {
          200: SingleMediaPostResponseSchema,
        },
      },
    },
    getMediaPostById
  );

  // GET: Get media post by slug
  app.get(
    '/media-posts/slug/:slug',
    {
      schema: {
        params: {
          type: 'object',
          required: ['slug'],
          properties: {
            slug: { type: 'string' },
          },
        },
        description: 'Get media post by slug',
        tags: ['media-posts'],
        response: {
          200: SingleMediaPostResponseSchema,
        },
      },
    },
    getMediaPostBySlug
  );

  // PATCH: Update media post
  app.patch(
    '/media-posts/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        ...UpdateMediaPostSchema,
        description: 'Update media post',
        tags: ['media-posts'],
        response: {
          200: SingleMediaPostResponseSchema,
        },
      },
      onRequest: [authGuard],
    },
    updateMediaPost
  );

  // DELETE: Delete media post
  app.delete(
    '/media-posts/:id',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        description: 'Delete media post',
        tags: ['media-posts'],
      },
      onRequest: [authGuard],
    },
    deleteMediaPost
  );

  // POST: Archive media post
  app.post(
    '/media-posts/:id/archive',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        description: 'Archive media post (soft delete)',
        tags: ['media-posts'],
        response: {
          200: SingleMediaPostResponseSchema,
        },
      },
      onRequest: [authGuard],
    },
    archiveMediaPost
  );

  // POST: Publish media post
  app.post(
    '/media-posts/:id/publish',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        description: 'Publish media post',
        tags: ['media-posts'],
        response: {
          200: SingleMediaPostResponseSchema,
        },
      },
      onRequest: [authGuard],
    },
    publishMediaPost
  );

  // POST: Schedule media post
  app.post(
    '/media-posts/:id/schedule',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        body: {
          type: 'object',
          required: ['scheduledAt'],
          properties: {
            scheduledAt: {
              type: 'string',
              format: 'date-time',
              description: 'Scheduled publishing date and time (ISO 8601)',
            },
          },
        },
        description: 'Schedule media post for future publishing',
        tags: ['media-posts'],
        response: {
          200: SingleMediaPostResponseSchema,
        },
      },
      onRequest: [authGuard],
    },
    scheduleMediaPost
  );

  // POST: Record share for media post
  app.post(
    '/media-posts/:id/share',
    {
      schema: {
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
        description: 'Record social share for media post',
        tags: ['media-posts'],
      },
    },
    recordShare
  );

  // POST: Bulk action on media posts
  app.post(
    '/media-posts/bulk-action',
    {
      schema: {
        ...BulkMediaPostActionSchema,
        description: 'Perform bulk actions on multiple media posts',
        tags: ['media-posts'],
        response: {
          200: BulkActionResponseSchema,
          207: BulkActionResponseSchema,
        },
      },
      onRequest: [authGuard],
    },
    bulkAction
  );
}
