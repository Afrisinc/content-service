/**
 * AI Generation Routes
 * Defines endpoints for AI content generation and scheduling
 */

import { authGuard } from '@/middlewares/authGuard';
import {
  GeneratePostForPlatformSchema,
  GeneratePostSchema,
  GetGenerationHistorySchema,
  PublishScheduledPostsSchema,
} from '@/schemas/requests/aiGeneration.schema';
import { FastifyInstance } from 'fastify';
import {
  generatePost,
  generatePostForPlatform,
  getGenerationHistory,
  publishScheduledPosts,
} from '../controllers/aiGeneration.controller';

export async function aiGenerationRoutes(app: FastifyInstance) {
  // POST: Generate posts from prompt
  app.post(
    '/content/ai/generate',
    {
      schema: GeneratePostSchema,
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
