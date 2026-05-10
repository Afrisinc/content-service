/**
 * MediaPost Controller
 * Handles HTTP requests for media post operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { MediaPostService } from '../services/mediaPost.service';
import {
  CreateMediaPostPayload,
  UpdateMediaPostPayload,
  MediaPostQueryParams,
  BulkMediaPostAction,
} from '@/types/mediaPost.types';
import { success, error } from '../utils/response';

const service = new MediaPostService();

/**
 * POST /media-posts
 * Create a new media post
 */
export async function createMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.body as CreateMediaPostPayload;
    const userId = (req as any).user?.id;

    const result = await service.createPost({
      ...payload,
      authorId: payload.authorId || userId,
    });

    return success(reply, 201, result.message, 1001, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error creating media post');
  }
}

/**
 * POST /media-posts/n8n-ingest
 * Create a new media post from n8n workflow (no auth required — internal automation)
 * n8nArticleId is passed as a string and converted to BigInt
 */
export async function n8nIngestMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const raw = req.body as CreateMediaPostPayload & { n8nArticleId?: string };

    const payload: CreateMediaPostPayload = {
      ...raw,
      n8nArticleId: raw.n8nArticleId ? BigInt(raw.n8nArticleId) : undefined,
      ai_generated: true,
    };

    const result = await service.createPost(payload);

    return success(reply, 201, result.message, 1001, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error ingesting media post from n8n');
  }
}

/**
 * GET /media-posts/:id
 * Get media post by ID
 */
export async function getMediaPostById(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const result = await service.getPostById(id);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 404, err.message || 'Error retrieving media post');
  }
}

/**
 * GET /media-posts/slug/:slug
 * Get media post by slug
 */
export async function getMediaPostBySlug(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { slug } = req.params as { slug: string };
    const result = await service.getPostBySlug(slug);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 404, err.message || 'Error retrieving media post');
  }
}

/**
 * GET /media-posts
 * Get paginated media posts with filters
 */
export async function getMediaPosts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const params = req.query as MediaPostQueryParams;
    const result = await service.getPosts(params);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving media posts');
  }
}

/**
 * PATCH /media-posts/:id
 * Update media post
 */
export async function updateMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const payload = req.body as UpdateMediaPostPayload;

    const result = await service.updatePost(id, payload);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error updating media post');
  }
}

/**
 * DELETE /media-posts/:id
 * Delete media post
 */
export async function deleteMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const result = await service.deletePost(id);

    return success(reply, 200, result.message);
  } catch (err: any) {
    return error(reply, 404, err.message || 'Error deleting media post');
  }
}

/**
 * POST /media-posts/:id/archive
 * Archive media post
 */
export async function archiveMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const result = await service.archivePost(id);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 404, err.message || 'Error archiving media post');
  }
}

/**
 * POST /media-posts/:id/publish
 * Publish media post
 */
export async function publishMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const result = await service.publishPost(id);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 404, err.message || 'Error publishing media post');
  }
}

/**
 * POST /media-posts/:id/schedule
 * Schedule media post for publishing
 */
export async function scheduleMediaPost(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const { scheduledAt } = req.body as { scheduledAt: string };

    if (!scheduledAt) {
      return error(reply, 400, 'scheduledAt date is required');
    }

    const result = await service.schedulePost(id, new Date(scheduledAt));

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error scheduling media post');
  }
}

/**
 * GET /media-posts/featured
 * Get featured posts
 */
export async function getFeaturedPosts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { limit } = req.query as { limit?: string };
    const result = await service.getFeaturedPosts(limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving featured posts');
  }
}

/**
 * GET /media-posts/breaking
 * Get breaking news posts
 */
export async function getBreakingNews(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { limit } = req.query as { limit?: string };
    const result = await service.getBreakingNews(limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving breaking news');
  }
}

/**
 * GET /media-posts/category/:category
 * Get posts by category
 */
export async function getByCategory(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { category } = req.params as { category: string };
    const { limit } = req.query as { limit?: string };

    const result = await service.getByCategory(category, limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving posts by category');
  }
}

/**
 * GET /media-posts/topic/:topic
 * Get posts by topic
 */
export async function getByTopic(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { topic } = req.params as { topic: string };
    const { limit } = req.query as { limit?: string };

    const result = await service.getByTopic(topic, limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving posts by topic');
  }
}

/**
 * GET /media-posts/search/:query
 * Search media posts
 */
export async function searchPosts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { query } = req.params as { query: string };
    const { limit } = req.query as { limit?: string };

    const result = await service.searchPosts(query, limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error searching media posts');
  }
}

/**
 * GET /media-posts/ai-generated
 * Get AI-generated posts
 */
export async function getAiGeneratedPosts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { limit } = req.query as { limit?: string };
    const result = await service.getAiGeneratedPosts(limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving AI-generated posts');
  }
}

/**
 * GET /media-posts/newsletter
 * Get posts for newsletter
 */
export async function getNewsletterPosts(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { limit } = req.query as { limit?: string };
    const result = await service.getNewsletterPosts(limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving newsletter posts');
  }
}

/**
 * GET /media-posts/videos
 * Get video articles
 */
export async function getVideoArticles(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { limit } = req.query as { limit?: string };
    const result = await service.getVideoArticles(limit ? parseInt(limit) : undefined);

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving video articles');
  }
}

/**
 * POST /media-posts/:id/share
 * Record share for media post
 */
export async function recordShare(req: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = req.params as { id: string };
    const result = await service.recordShare(id);

    return success(reply, 200, result.message);
  } catch (err: any) {
    return error(reply, 404, err.message || 'Error recording share');
  }
}

/**
 * GET /media-posts/stats
 * Get media post statistics
 */
export async function getStatistics(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await service.getStatistics();

    return success(reply, 200, result.message, 1000, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving statistics');
  }
}

/**
 * POST /media-posts/bulk-action
 * Perform bulk action on media posts
 */
export async function bulkAction(req: FastifyRequest, reply: FastifyReply) {
  try {
    const payload = req.body as BulkMediaPostAction;
    const result = await service.bulkAction(payload);

    return success(reply, result.success ? 200 : 207, result.message, 1001, result.data);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error performing bulk action');
  }
}
