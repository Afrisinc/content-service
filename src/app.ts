import Fastify from 'fastify';
import { registerRoutes } from './routes';
import { errorHandler } from './middlewares/errorHandler';

const createApp = async () => {
  const app = Fastify({ logger: true });

  await app.register(import('@fastify/swagger'), {
    swagger: {
      info: {
        title: 'Backend Template API',
        description: 'Node.js backend template with Fastify and Prisma',
        version: '1.0.0',
      },
      host: 'localhost:3000',
      schemes: ['http'],
      consumes: ['application/json'],
      produces: ['application/json'],
      securityDefinitions: {
        bearerAuth: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
          description: 'Bearer token for authentication. Format: Bearer <token>',
        },
      },
      tags: [
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'users', description: 'User management endpoints' },
        { name: 'health', description: 'Health check endpoints' },
        { name: 'social-media', description: 'Social media posting endpoints' },
        {
          name: 'ai-generation',
          description: 'AI-powered content generation endpoints',
        },
      ],
    },
  });

  await app.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'full',
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });

  app.setErrorHandler(errorHandler);

  await registerRoutes(app);

  return app;
};

export { createApp };
