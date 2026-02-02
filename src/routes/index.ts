import { HealthRouteSchema } from '@/schemas';
import { FastifyInstance } from 'fastify';
import { aiGenerationRoutes } from './aiGeneration.routes';
import { ArticlesRoutes } from './articles.routes';
import { GeneratedPostsRoutes } from './n8nGeneratedPosts.routes';
import { authRoutes } from './auth.routes';
import { socialMediaRoutes } from './socialMedia.routes';
import { userRoutes } from './user.routes';

export async function registerRoutes(app: FastifyInstance) {
  app.get(
    '/health',
    {
      schema: HealthRouteSchema,
    },
    async () => {
      return { status: 'ok', message: 'Server is running' };
    }
  );

  app.register(authRoutes);
  app.register(userRoutes);
  app.register(socialMediaRoutes);
  app.register(aiGenerationRoutes);
  app.register(ArticlesRoutes);
  app.register(GeneratedPostsRoutes);
}
