/**
 * AI Generation Controller
 * Handles HTTP requests for AI content generation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { GeneratePostRequest } from '@/types/aiGeneration.types';
import { aiGenerationService } from '@/services/aiGeneration.service';
import { logger } from '@/utils/logger';

/**
 * Generate posts from prompt (with optional scheduling)
 */
export async function generatePost(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const userId = request.user?.userId || '';
    const body = request.body as Partial<GeneratePostRequest>;

    // Validate required fields
    if (!body.prompt) {
      return reply.status(400).send({
        success: false,
        message: 'Prompt is required',
        error: 'Missing required field: prompt',
      });
    }

    if (!body.platforms || body.platforms.length === 0) {
      return reply.status(400).send({
        success: false,
        message: 'At least one platform is required',
        error: 'Missing required field: platforms',
      });
    }

    // Parse schedule time if provided
    let scheduleFor: Date | null = null;
    if (body.scheduleFor) {
      const scheduledTime = new Date(body.scheduleFor);
      if (isNaN(scheduledTime.getTime())) {
        return reply.status(400).send({
          success: false,
          message: 'Invalid schedule time format',
          error: 'scheduleFor must be a valid ISO 8601 datetime',
        });
      }
      scheduleFor = scheduledTime;
    }

    // Validate userId is present
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'User authentication required',
        error: 'Valid user ID not found in token',
      });
    }

    const generateRequest: GeneratePostRequest = {
      prompt: body.prompt,
      platforms: body.platforms,
      tone: body.tone || 'professional',
      includeEmojis: body.includeEmojis ?? true,
      includeHashtags: body.includeHashtags ?? true,
      maxLength: body.maxLength || 500,
      language: body.language || 'en',
      scheduleFor,
      userId,
      imageUrl: body.imageUrl,
      includeImage: body.includeImage ?? false,
      imageStyle: body.imageStyle,
    };

    logger.info(
      {
        userId,
        platforms: generateRequest.platforms,
        scheduled: !!scheduleFor,
      },
      'Generating posts from prompt'
    );

    const result =
      await aiGenerationService.generateAndSchedulePosts(generateRequest);

    if (result.success) {
      return reply.status(201).send(result);
    } else {
      return reply.status(400).send(result);
    }
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      'Error in generatePost controller'
    );

    return reply.status(500).send({
      success: false,
      message: 'Failed to generate posts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Generate post for specific platform
 */
export async function generatePostForPlatform(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const body = request.body as Partial<GeneratePostRequest>;

    if (!body.prompt) {
      return reply.status(400).send({
        success: false,
        message: 'Prompt is required',
        error: 'Missing required field: prompt',
      });
    }

    if (!body.platforms || body.platforms.length === 0) {
      return reply.status(400).send({
        success: false,
        message: 'Platform is required',
        error: 'Missing required field: platforms',
      });
    }

    const platform = body.platforms[0];

    logger.info(
      {
        platform,
      },
      'Generating platform-specific content'
    );

    const content = await aiGenerationService.generatePostForPlatform(
      body.prompt,
      platform,
      {
        tone: body.tone || 'professional',
        maxLength: body.maxLength,
        includeEmojis: body.includeEmojis,
        includeHashtags: body.includeHashtags,
      }
    );

    return reply.status(200).send({
      success: true,
      message: `Content generated for ${platform}`,
      data: {
        content,
        platform,
      },
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error generating platform-specific content'
    );

    return reply.status(500).send({
      success: false,
      message: 'Failed to generate content',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Publish all scheduled posts due for publication
 */
export async function publishScheduledPosts(
  _request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    logger.info({}, 'Publishing scheduled posts');

    const result = await aiGenerationService.publishScheduledPosts();

    return reply.status(200).send({
      success: true,
      message: `Published ${result.published} posts, ${result.failed} failed`,
      data: result,
    });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error publishing scheduled posts'
    );

    return reply.status(500).send({
      success: false,
      message: 'Failed to publish scheduled posts',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get user's AI generation history
 */
export async function getGenerationHistory(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  try {
    const userId = request.user?.userId;
    if (!userId) {
      return reply.status(401).send({
        success: false,
        message: 'User not authenticated',
        error: 'Authentication required',
      });
    }

    const query = request.query as { limit?: string; offset?: string };
    const limit = Math.min(parseInt(query.limit || '10'), 100);
    const offset = parseInt(query.offset || '0');

    logger.info(
      {
        userId,
        limit,
        offset,
      },
      'Fetching generation history'
    );

    const result = await aiGenerationService.getUserGenerationHistory(
      userId,
      limit,
      offset
    );

    return reply.status(200).send(result);
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error fetching generation history'
    );

    return reply.status(500).send({
      success: false,
      message: 'Failed to fetch generation history',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
