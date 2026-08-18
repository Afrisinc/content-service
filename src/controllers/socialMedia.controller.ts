import { createError } from '@/middlewares/errorHandler';
import { SocialMediaPostPayload } from '@/types/socialMedia.types';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { logger } from '@/utils/logger';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SocialMediaService } from '../services/socialMedia.service';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { getAssetsClient } from '@/utils/assets-client';

const service = new SocialMediaService();

export async function postToSocialMedia(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.body as SocialMediaPostPayload;
  const userId = req.user!.userId;

  const result = await service.postToSocialMedia(payload, userId);

  if (result.status === 'failed') {
    throw createError.badRequest(result.error || 'Failed to post to social media');
  }

  return ApiResponseHelper.created(reply, 'Post published successfully', result);
}

export async function getSocialMediaPost(req: FastifyRequest, reply: FastifyReply) {
  const { postId } = req.params as { postId: string };
  const { accessToken } = req.query as { accessToken: string };

  if (!accessToken) {
    throw createError.badRequest('Access token is required');
  }

  const result = await service.getPostDetails(postId, accessToken);
  return ApiResponseHelper.success(
    reply,
    'Post retrieved successfully',
    result,
    ResponseCode.SUCCESS,
    200
  );
}

export async function deleteSocialMediaPost(req: FastifyRequest, reply: FastifyReply) {
  const { postId } = req.params as { postId: string };
  const userId = req.user?.userId;

  if (!postId) {
    throw createError.badRequest('Post ID is required');
  }

  if (!userId) {
    throw createError.badRequest('User not authenticated');
  }

  // Get post to verify ownership
  const post = await socialMediaPostRepository.getPostById(postId);

  if (!post) {
    throw createError.notFound('Post not found');
  }

  if (post.userId !== userId) {
    throw createError.forbidden("Cannot delete another user's post");
  }

  // Delete from database only
  await socialMediaPostRepository.deletePost(postId);

  return ApiResponseHelper.success(
    reply,
    'Post deleted successfully',
    {},
    ResponseCode.SUCCESS,
    200
  );
}

export async function batchPostToSocialMedia(req: FastifyRequest, reply: FastifyReply) {
  const payloads = req.body as SocialMediaPostPayload[];
  const userId = req.user!.userId;

  if (!Array.isArray(payloads) || payloads.length === 0) {
    throw createError.badRequest('Payload must be an array of social media post requests');
  }

  const results = await service.batchPostToSocialMedia(payloads, userId);
  const successCount = results.filter(r => r.status === 'success').length;
  const failureCount = results.filter(r => r.status === 'failed').length;

  return ApiResponseHelper.created(
    reply,
    `Batch posting completed (${successCount} success, ${failureCount} failed)`,
    {
      results,
      summary: {
        total: results.length,
        success: successCount,
        failed: failureCount,
      },
    }
  );
}

export async function validateSocialMediaPayload(req: FastifyRequest, reply: FastifyReply) {
  const payload = req.body as SocialMediaPostPayload;
  return ApiResponseHelper.success(
    reply,
    'Payload is valid',
    { valid: true, payload },
    ResponseCode.SUCCESS,
    200
  );
}

export async function getAllSocialMediaPosts(req: FastifyRequest, reply: FastifyReply) {
  const {
    platform,
    status,
    limit = 20,
    offset = 0,
  } = req.query as {
    platform?: string;
    status?: string;
    limit?: number;
    offset?: number;
  };

  const result = await service.getAllPosts({
    platform,
    status,
    limit: Math.min(Number(limit), 100),
    offset: Number(offset),
  });

  // Debug log to check what's in the data
  logger.info({ postsCount: result.posts.length, firstPost: result.posts[0] }, 'Posts data');

  const msg = 'Posts retrieved successfully';
  return ApiResponseHelper.success(reply, msg, result, ResponseCode.SUCCESS, 200);
}

export async function getUserSocialMediaPosts(req: FastifyRequest, reply: FastifyReply) {
  const userId = req.user!.userId;

  const {
    platform,
    status,
    limit = 20,
    offset = 0,
  } = req.query as {
    platform?: string;
    status?: string;
    limit?: number;
    offset?: number;
  };

  const result = await service.getUserPosts(userId, {
    platform,
    status,
    limit: Math.min(Number(limit), 100),
    offset: Number(offset),
  });

  return ApiResponseHelper.success(
    reply,
    'User posts retrieved successfully',
    result,
    ResponseCode.SUCCESS,
    200
  );
}

export async function updateSocialMediaPost(req: FastifyRequest, reply: FastifyReply) {
  const { postId } = req.params as { postId: string };
  const userId = req.user!.userId;
  const payload = req.body as Partial<SocialMediaPostPayload>;

  if (!postId) {
    throw createError.badRequest('Post ID is required');
  }

  const result = await service.updatePost(postId, userId, payload);
  return ApiResponseHelper.success(
    reply,
    'Post updated successfully',
    result,
    ResponseCode.SUCCESS,
    200
  );
}

export async function initializeAssetsFolders(req: FastifyRequest, reply: FastifyReply) {
  try {
    const assetsClient = getAssetsClient();
    const folders = await assetsClient.listFolders();
    const socialMediaFolder = folders.find(f => f.name === 'social-media');

    if (!socialMediaFolder) {
      const newFolder = await assetsClient.createFolder(
        'social-media',
        'Assets for social media posts'
      );
      (global as any).SOCIAL_MEDIA_FOLDER_ID = newFolder.id;
      logger.info({ folderId: newFolder.id }, 'Created social-media folder');

      return ApiResponseHelper.success(
        reply,
        'Social media folder created successfully',
        { folderId: newFolder.id, folderName: 'social-media' },
        ResponseCode.SUCCESS,
        201
      );
    } else {
      (global as any).SOCIAL_MEDIA_FOLDER_ID = socialMediaFolder.id;
      logger.info({ folderId: socialMediaFolder.id }, 'Using existing social-media folder');

      return ApiResponseHelper.success(
        reply,
        'Social media folder already exists',
        { folderId: socialMediaFolder.id, folderName: 'social-media' },
        ResponseCode.SUCCESS,
        200
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error({ error: errorMsg }, 'Failed to initialize Assets folder');
    throw createError.internal(`Failed to initialize Assets folder: ${errorMsg}`);
  }
}

export async function publishScheduledPostNow(req: FastifyRequest, reply: FastifyReply) {
  const { postId } = req.params as { postId: string };
  const userId = req.user?.userId;

  const result = await service.publishScheduledPostNow(postId, userId || '');

  const statusCode = result.status === 'success' ? 200 : 400;
  return ApiResponseHelper.success(reply, result.message, result, ResponseCode.SUCCESS, statusCode);
}
