/**
 * AI Generation Controller
 * Handles HTTP requests for AI content generation
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { GeneratePostRequest, AIAgentGeneratePostRequest } from '@/types/aiGeneration.types';
import { aiGenerationService } from '@/services/aiGeneration.service';
import { aiAgentService } from '@/services/aiAgent.service';
import { logger } from '@/utils/logger';

/**
 * Generate posts from prompt using external AI Agent service
 */
export async function generatePost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  try {
    const body = request.body as Partial<AIAgentGeneratePostRequest>;

    // Validate required fields
    if (!body.topic) {
      return reply.status(400).send({
        success: false,
        message: 'Topic is required',
        error: 'Missing required field: topic',
      });
    }

    const aiAgentRequest: AIAgentGeneratePostRequest = {
      topic: body.topic,
      keywords: body.keywords,
      link: body.link,
      submittedAt: body.submittedAt || new Date().toISOString(),
      formMode: body.formMode || 'production',
    };

    logger.info(
      {
        topic: aiAgentRequest.topic,
        formMode: aiAgentRequest.formMode,
      },
      'Generating post with external AI Agent'
    );

    const result = await aiAgentService.generatePost(aiAgentRequest);

    return reply.status(201).send(result);
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
      message: 'Failed to generate post',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Generate post for specific platform
 */
export async function generatePostForPlatform(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

    const content = await aiGenerationService.generatePostForPlatform(body.prompt, platform, {
      tone: body.tone || 'professional',
      maxLength: body.maxLength,
      includeEmojis: body.includeEmojis,
      includeHashtags: body.includeHashtags,
    });

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
export async function publishScheduledPosts(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
export async function getGenerationHistory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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

    const result = await aiGenerationService.getUserGenerationHistory(userId, limit, offset);

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
