import crypto from 'node:crypto';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { env } from '@/config/env';
import { logger } from '@/utils/logger.js';

const TIMESTAMP_TOLERANCE = 300;
const PUBLIC_PATHS = ['/health', '/live', '/ready', '/docs', '/uploads', '/favicon.ico'];

const isPublicPath = (url: string): boolean => {
  const path = url.split('?')[0];
  return PUBLIC_PATHS.some(publicPath => path === publicPath || path.startsWith(`${publicPath}/`));
};

const verifySignature = (request: FastifyRequest): string | null => {
  const signature = request.headers['x-gateway-signature'] as string;
  const timestamp = request.headers['x-gateway-timestamp'] as string;

  if (!signature || !timestamp) {
    return 'Missing gateway signature headers';
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const requestTime = Number.parseInt(timestamp, 10);

  if (Number.isNaN(requestTime) || Math.abs(currentTime - requestTime) > TIMESTAMP_TOLERANCE) {
    return 'Request timestamp is invalid or expired';
  }

  const path = request.url.split('?')[0];
  const body = request.body ? JSON.stringify(request.body) : '';
  const data = `${request.method}:${path}:${timestamp}:${body}`;
  const expected = crypto.createHmac('sha256', env.SERVICE_SECRET).update(data).digest('hex');

  console.log('[Backend Signature Check]', {
    method: request.method,
    path,
    timestamp,
    body,
    received_signature: signature,
    expected_signature: expected,
    match: signature === expected,
  });

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return 'Invalid gateway signature';
  }

  return null;
};

export async function registerGatewayGuard(app: FastifyInstance) {
  app.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    if (isPublicPath(request.url)) {
      return;
    }

    const error = verifySignature(request);

    if (error) {
      logger.warn(
        { ip: request.ip, path: request.url, reason: error },
        'Gateway signature verification failed'
      );
      return reply.status(401).send({
        success: false,
        resp_code: 401,
        resp_msg: error,
      });
    }
  });
}
