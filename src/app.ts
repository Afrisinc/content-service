import Fastify from 'fastify';
import { registerRoutes } from './routes';
import { errorHandler } from './middlewares/errorHandler';
import { env } from './config/env';

const createApp = async () => {
  const app = Fastify({ logger: true });

  // Register CORS
  // Parse allowed origins: can be '*', 'true', or comma-separated URLs
  let corsOrigin: boolean | string | RegExp | (string | RegExp)[] = '*';

  if (env.CORS_ORIGIN && env.CORS_ORIGIN !== '*' && env.CORS_ORIGIN !== 'true') {
    // If multiple origins, split by comma and trim
    corsOrigin = env.CORS_ORIGIN.split(',').map(url => url.trim());
  } else if (env.CORS_ORIGIN === 'true') {
    corsOrigin = true;
  }

  await app.register(import('@fastify/cors'), {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

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
      docExpansion: 'list',
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
