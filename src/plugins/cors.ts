/**
 * CORS Plugin
 * Registers CORS middleware with configurable origins
 */

import { FastifyInstance } from 'fastify';
import { env } from '@/config/env';

export async function registerCors(app: FastifyInstance) {
  let corsOrigin: boolean | string | RegExp | (string | RegExp)[] = '*';

  if (env.CORS_ORIGIN && env.CORS_ORIGIN !== '*' && env.CORS_ORIGIN !== 'true') {
    corsOrigin = env.CORS_ORIGIN.split(',').map(url => url.trim());
  } else if (env.CORS_ORIGIN === 'true') {
    corsOrigin = true;
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN must be explicitly configured in production');
  }

  await app.register(import('@fastify/cors'), {
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
}
