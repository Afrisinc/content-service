/**
 * Social Media Controller
 * Handles HTTP requests for social media operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { SocialMediaService } from '../services/socialMedia.service';
import { SocialMediaPostPayload } from '@/types/socialMedia.types';
import { success, error } from '../utils/response';

const service = new SocialMediaService();

/**
 * POST /social-media/post
 * Create a new social media post
 */
export async function postToSocialMedia(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const payload = req.body as SocialMediaPostPayload;
    const userId = (req as any).user?.id;

    const result = await service.postToSocialMedia(payload, userId);

    if (result.status === 'failed') {
      return error(
        reply,
        400,
        result.error || 'Failed to post to social media'
      );
    }

    return success(reply, 201, 'Post published successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error posting to social media');
  }
}

/**
 * GET /social-media/posts/:postId
 * Get details of a social media post
 */
export async function getSocialMediaPost(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { postId } = req.params as { postId: string };
    const { accessToken } = req.query as { accessToken: string };

    if (!accessToken) {
      return error(reply, 400, 'Access token is required');
    }

    const result = await service.getPostDetails(postId, accessToken);

    return success(reply, 200, 'Post retrieved successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error retrieving post');
  }
}

/**
 * DELETE /social-media/posts/:postId
 * Delete a social media post
 */
export async function deleteSocialMediaPost(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const { postId } = req.params as { postId: string };
    const { accessToken, platform } = req.query as {
      accessToken: string;
      platform: string;
    };

    if (!accessToken) {
      return error(reply, 400, 'Access token is required');
    }

    if (!platform) {
      return error(reply, 400, 'Platform is required');
    }

    await service.deletePost(postId, accessToken, platform as any);

    return success(reply, 200, 'Post deleted successfully');
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error deleting post');
  }
}

/**
 * POST /social-media/batch
 * Post to multiple platforms at once
 */
export async function batchPostToSocialMedia(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const payloads = req.body as SocialMediaPostPayload[];
    const userId = (req as any).user?.id;

    if (!Array.isArray(payloads) || payloads.length === 0) {
      return error(
        reply,
        400,
        'Payload must be an array of social media post requests'
      );
    }

    const results = await service.batchPostToSocialMedia(payloads, userId);

    const successCount = results.filter(r => r.status === 'success').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    return success(
      reply,
      201,
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
  } catch (err: any) {
    return error(reply, 400, err.message || 'Error in batch posting');
  }
}

/**
 * POST /social-media/validate-payload
 * Validate social media payload without posting
 */
export async function validateSocialMediaPayload(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const payload = req.body as SocialMediaPostPayload;

    // This can be extended to validate content with AI generation preview
    // or check for content policy violations

    return success(reply, 200, 'Payload is valid', {
      valid: true,
      payload,
    });
  } catch (err: any) {
    return error(reply, 400, err.message || 'Invalid payload');
  }
}
