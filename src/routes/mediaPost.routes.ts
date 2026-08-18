import {
  archiveMediaPost,
  bulkAction,
  createMediaPost,
  deleteMediaPost,
  getAiGeneratedPosts,
  getBreakingNews,
  getByCategory,
  getByTopic,
  getFeaturedPosts,
  getMediaPostById,
  getMediaPostBySlug,
  getMediaPosts,
  getNewsletterPosts,
  getStatistics,
  getVideoArticles,
  n8nIngestMediaPost,
  publishMediaPost,
  recordShare,
  scheduleMediaPost,
  searchPosts,
  updateMediaPost,
} from '@/controllers/mediaPost.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import {
  BulkMediaPostActionSchema,
  CreateMediaPostSchema,
  GetMediaPostsQuerySchema,
  UpdateMediaPostSchema,
} from '@/schemas/requests/mediaPost.schema';
import {
  MediaPostStatsResponseSchema,
  PaginatedMediaPostResponseSchema,
  SingleMediaPostResponseSchema,
} from '@/schemas/responses/mediaPost.schema';
import { FastifyInstance } from 'fastify';

export async function mediaPostRoutes(app: FastifyInstance) {
  app.post(
    '/media-posts',
    { schema: { ...CreateMediaPostSchema, tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(createMediaPost)
  );

  app.post(
    '/media-posts/n8n-ingest',
    {
      schema: {
        ...CreateMediaPostSchema,
        tags: ['media-posts'],
        description: 'Ingest from n8n (no auth)',
      },
    },
    asyncWrapper(n8nIngestMediaPost)
  );

  app.get(
    '/media-posts',
    { schema: { ...GetMediaPostsQuerySchema, tags: ['media-posts'] } },
    asyncWrapper(getMediaPosts)
  );

  app.get(
    '/media-posts/stats',
    { schema: { ...MediaPostStatsResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getStatistics)
  );

  app.get(
    '/media-posts/featured',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getFeaturedPosts)
  );

  app.get(
    '/media-posts/breaking',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getBreakingNews)
  );

  app.get(
    '/media-posts/ai-generated',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getAiGeneratedPosts)
  );

  app.get(
    '/media-posts/newsletter',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getNewsletterPosts)
  );

  app.get(
    '/media-posts/videos',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getVideoArticles)
  );

  app.get(
    '/media-posts/category/:category',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getByCategory)
  );

  app.get(
    '/media-posts/topic/:topic',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getByTopic)
  );

  app.get(
    '/media-posts/search/:query',
    { schema: { ...PaginatedMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(searchPosts)
  );

  app.get(
    '/media-posts/:id',
    { schema: { ...SingleMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getMediaPostById)
  );

  app.get(
    '/media-posts/slug/:slug',
    { schema: { ...SingleMediaPostResponseSchema, tags: ['media-posts'] } },
    asyncWrapper(getMediaPostBySlug)
  );

  app.patch(
    '/media-posts/:id',
    { schema: { ...UpdateMediaPostSchema, tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(updateMediaPost)
  );

  app.delete(
    '/media-posts/:id',
    { schema: { tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(deleteMediaPost)
  );

  app.post(
    '/media-posts/:id/archive',
    { schema: { ...SingleMediaPostResponseSchema, tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(archiveMediaPost)
  );

  app.post(
    '/media-posts/:id/publish',
    { schema: { ...SingleMediaPostResponseSchema, tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(publishMediaPost)
  );

  app.post(
    '/media-posts/:id/schedule',
    { schema: { ...SingleMediaPostResponseSchema, tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(scheduleMediaPost)
  );

  app.post(
    '/media-posts/:id/share',
    { schema: { tags: ['media-posts'] } },
    asyncWrapper(recordShare)
  );

  app.post(
    '/media-posts/bulk-action',
    { schema: { ...BulkMediaPostActionSchema, tags: ['media-posts'] }, onRequest: [authGuard] },
    asyncWrapper(bulkAction)
  );
}
