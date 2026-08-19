/**
 * Swagger Documentation Plugin
 * Registers Swagger and Swagger UI for API documentation
 */

import { FastifyInstance } from 'fastify';

export async function registerSwagger(app: FastifyInstance) {
  // Register Swagger documentation using OpenAPI 3.0 format
  // This enables server switching dropdown in Swagger UI
  await app.register(import('@fastify/swagger'), {
    openapi: {
      openapi: '3.0.0',
      info: {
        title: 'Afrisinc Media Service API',
        description:
          'API for managing media posts, articles, N8N-generated content, and news content for the Afrisinc platform',
        version: '1.0.0',
      },
      servers: [
        {
          url: 'http://localhost:8093',
          description: 'Local Development',
        },
        {
          url: 'https://mediaqa.api.afrisinc.com/',
          description: 'Production',
        },
        {
          url: 'https://mediastaging.api.afrisinc.com/',
          description: 'Production',
        },
        {
          url: 'https://media.api.afrisinc.com/',
          description: 'Production',
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'Bearer token for authentication. Format: Bearer <token>',
          },
        },
      },
      tags: [
        { name: 'auth', description: 'Authentication endpoints' },
        { name: 'users', description: 'User management endpoints' },
        { name: 'health', description: 'Health check endpoints' },
        { name: 'social-media', description: 'Social media posting endpoints' },
        { name: 'ai-generation', description: 'AI-powered content generation endpoints' },
        { name: 'articles', description: 'N8N articles endpoints' },
        { name: 'ai-usage', description: 'AI spend, quota and usage reporting' },
        { name: 'newsletter', description: 'Newsletter digest generation and delivery' },
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
