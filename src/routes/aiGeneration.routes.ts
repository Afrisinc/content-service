/**
 * AI Generation Routes
 * Defines endpoints for AI content generation and scheduling
 */

import { FastifyInstance } from 'fastify';
import {
  generatePost,
  generatePostForPlatform,
  publishScheduledPosts,
  getGenerationHistory,
} from '../controllers/aiGeneration.controller';
import {
  GeneratePostSchema,
  GeneratePostForPlatformSchema,
  PublishScheduledPostsSchema,
  GetGenerationHistorySchema,
} from '@/schemas/requests/aiGeneration.schema';
import { authGuard } from '@/middlewares/authGuard';

export async function aiGenerationRoutes(app: FastifyInstance) {
  // POST: Generate posts from prompt
  app.post(
    '/ai/generate',
    {
      schema: GeneratePostSchema,
      onRequest: [authGuard],
    },
    generatePost
  );

  // POST: Generate content for specific platform
  app.post(
    '/ai/generate-platform',
    {
      schema: GeneratePostForPlatformSchema,
      onRequest: [authGuard],
    },
    generatePostForPlatform
  );

  // POST: Publish all scheduled posts due for publication
  app.post(
    '/ai/publish-scheduled',
    {
      schema: PublishScheduledPostsSchema,
      onRequest: [authGuard],
    },
    publishScheduledPosts
  );

  // GET: Get user's AI generation history
  app.get(
    '/ai/history',
    {
      schema: GetGenerationHistorySchema,
      onRequest: [authGuard],
    },
    getGenerationHistory
  );
}
