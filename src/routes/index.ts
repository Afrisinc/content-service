import { HealthRouteSchema } from '@/schemas';
import { FastifyInstance } from 'fastify';
import { accountGroupRoutes } from './accountGroup.routes';
import { analyticsRoutes } from './analytics.routes';
import { aiGenerationRoutes } from './aiGeneration.routes';
import { automationRoutes } from './automation.routes';
import { ArticlesRoutes } from './articles.routes';
import { postAgentRoutes } from './postAgent.routes';
import { GeneratedPostsRoutes } from './n8nGeneratedPosts.routes';
import { socialMediaRoutes } from './socialMedia.routes';
import { socialMediaIntegrationRoutes } from './socialMediaIntegration.routes';
import { userRoutes } from './user.routes';
import { mediaPostRoutes } from './mediaPost.routes';
import { aiUsageRoutes } from './aiUsage.routes';
import { newsletterDigestRoutes } from './newsletterDigest.routes';
import { brandAssetRoutes } from './brandAsset.routes';

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

  app.register(userRoutes);
  app.register(socialMediaRoutes);
  app.register(socialMediaIntegrationRoutes);
  app.register(mediaPostRoutes);
  app.register(aiGenerationRoutes);
  app.register(ArticlesRoutes);
  app.register(GeneratedPostsRoutes);
  app.register(aiUsageRoutes);
  app.register(newsletterDigestRoutes);
  app.register(brandAssetRoutes);
  app.register(postAgentRoutes);
  app.register(accountGroupRoutes);
  app.register(automationRoutes);
  app.register(analyticsRoutes);
}
