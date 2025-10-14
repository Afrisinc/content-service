import { HealthResponseSchema } from '../responses/common.schema';

export const HealthRouteSchema = {
  tags: ['health'],
  summary: 'Health check endpoint',
  description: 'Check if the server is running and healthy',
  response: {
    200: HealthResponseSchema,
  },
} as const;
