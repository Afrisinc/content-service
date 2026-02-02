/**
 * Swagger Documentation Plugin
 * Registers Swagger and Swagger UI for API documentation
 */

import { env } from '@/config/env';
import { FastifyInstance } from 'fastify';

export async function registerSwagger(app: FastifyInstance) {
  // Register Swagger documentation
  await app.register(import('@fastify/swagger'), {
    swagger: {
      info: {
        title: 'Backend Template API',
        description: 'Node.js backend template with Fastify and Prisma',
        version: '1.0.0',
      },
      host: env.API_BASE_URL || 'localhost:8093',
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
        { name: 'ai-generation', description: 'AI-powered content generation endpoints' },
        { name: 'articles', description: 'N8N articles endpoints' },
      ],
    },
  });

  // Register Swagger UI
  await app.register(import('@fastify/swagger-ui'), {
    routePrefix: '/docs',
    uiConfig: {
      docExpansion: 'list',
      deepLinking: false,
    },
    staticCSP: true,
    transformSpecificationClone: true,
  });
}
