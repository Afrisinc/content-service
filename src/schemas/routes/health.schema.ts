import {
  HealthResponseSchema,
  LiveResponseSchema,
  ReadyResponseSchema,
} from '../responses/common.schema';

export const HealthRouteSchema = {
  tags: ['health'],
  summary: 'Health check endpoint',
  description: 'Check if the server is running and healthy',
  response: {
    200: HealthResponseSchema,
  },
} as const;

export const LiveRouteSchema = {
  tags: ['health'],
  summary: 'Liveness probe',
  description: 'Lightweight check that the process is up',
  response: {
    200: LiveResponseSchema,
  },
} as const;

export const ReadyRouteSchema = {
  tags: ['health'],
  summary: 'Readiness probe',
  description: 'Checks the database and cache dependencies before accepting traffic',
  response: {
    200: ReadyResponseSchema,
    503: ReadyResponseSchema,
  },
} as const;
