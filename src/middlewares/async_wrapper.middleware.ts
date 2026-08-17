import { FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../utils/logger';

export function asyncWrapper(fn: (request: FastifyRequest, reply: FastifyReply) => Promise<any>) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return await fn(request, reply);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Internal server error';
      logger.error({ error: message, stack: err instanceof Error ? err.stack : undefined }, 'Async handler error');
      throw err;
    }
  };
}
