import crypto from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '@/config/env';

vi.mock('@/utils/logger.js', () => ({
  logger: { warn: vi.fn() },
}));

const { registerGatewayGuard } = await import('@/plugins/gatewayGuard');
const { logger } = await import('@/utils/logger.js');

type PreValidationHook = (
  request: {
    url: string;
    method: string;
    body?: unknown;
    headers: Record<string, string>;
    ip: string;
  },
  reply: { status: (code: number) => { send: (body: unknown) => void } }
) => Promise<void> | void;

async function getHook(): Promise<PreValidationHook> {
  let hook: PreValidationHook | undefined;
  const app = {
    addHook: (name: string, handler: PreValidationHook) => {
      if (name === 'preValidation') {
        hook = handler;
      }
    },
  };
  await registerGatewayGuard(app as never);
  if (!hook) {
    throw new Error('preValidation hook was not registered');
  }
  return hook;
}

function makeReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return { status, send };
}

function sign(method: string, path: string, timestamp: string, body = ''): string {
  const data = `${method}:${path}:${timestamp}:${body}`;
  return crypto.createHmac('sha256', env.SERVICE_SECRET).update(data).digest('hex');
}

describe('registerGatewayGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe.each([
    '/health',
    '/health/detailed',
    '/live',
    '/ready',
    '/docs',
    '/uploads',
    '/favicon.ico',
  ])('public path %s', path => {
    it('is let through without a signature', async () => {
      const hook = await getHook();
      const reply = makeReply();

      await hook({ url: path, method: 'GET', headers: {}, ip: '127.0.0.1' }, reply);

      expect(reply.status).not.toHaveBeenCalled();
    });
  });

  it('rejects a protected route with no signature headers', async () => {
    const hook = await getHook();
    const reply = makeReply();

    await hook({ url: '/api/v1/articles', method: 'GET', headers: {}, ip: '127.0.0.1' }, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith({
      success: false,
      resp_code: 401,
      resp_msg: 'Missing gateway signature headers',
    });
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('rejects an expired timestamp', async () => {
    const hook = await getHook();
    const reply = makeReply();
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);

    await hook(
      {
        url: '/api/v1/articles',
        method: 'GET',
        headers: {
          'x-gateway-signature': 'irrelevant',
          'x-gateway-timestamp': staleTimestamp,
        },
        ip: '127.0.0.1',
      },
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ resp_msg: 'Request timestamp is invalid or expired' })
    );
  });

  it('rejects a non-numeric timestamp', async () => {
    const hook = await getHook();
    const reply = makeReply();

    await hook(
      {
        url: '/api/v1/articles',
        method: 'GET',
        headers: { 'x-gateway-signature': 'irrelevant', 'x-gateway-timestamp': 'not-a-number' },
        ip: '127.0.0.1',
      },
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ resp_msg: 'Request timestamp is invalid or expired' })
    );
  });

  it('rejects a signature that does not match', async () => {
    const hook = await getHook();
    const reply = makeReply();
    const timestamp = String(Math.floor(Date.now() / 1000));

    await hook(
      {
        url: '/api/v1/articles',
        method: 'GET',
        headers: {
          'x-gateway-signature': 'wrong-signature-value',
          'x-gateway-timestamp': timestamp,
        },
        ip: '127.0.0.1',
      },
      reply
    );

    expect(reply.status).toHaveBeenCalledWith(401);
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ resp_msg: 'Invalid gateway signature' })
    );
  });

  it('lets a request with a valid signature through', async () => {
    const hook = await getHook();
    const reply = makeReply();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign('GET', '/api/v1/articles', timestamp);

    await hook(
      {
        url: '/api/v1/articles',
        method: 'GET',
        headers: { 'x-gateway-signature': signature, 'x-gateway-timestamp': timestamp },
        ip: '127.0.0.1',
      },
      reply
    );

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('signs the request body along with the path', async () => {
    const hook = await getHook();
    const reply = makeReply();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = { title: 'Draft' };
    const signature = sign('POST', '/api/v1/articles', timestamp, JSON.stringify(body));

    await hook(
      {
        url: '/api/v1/articles',
        method: 'POST',
        body,
        headers: { 'x-gateway-signature': signature, 'x-gateway-timestamp': timestamp },
        ip: '127.0.0.1',
      },
      reply
    );

    expect(reply.status).not.toHaveBeenCalled();
  });

  it('does not treat a path merely prefixed by a public path as public', async () => {
    const hook = await getHook();
    const reply = makeReply();

    await hook({ url: '/livestream', method: 'GET', headers: {}, ip: '127.0.0.1' }, reply);

    expect(reply.status).toHaveBeenCalledWith(401);
  });

  it('strips the query string before matching a public path', async () => {
    const hook = await getHook();
    const reply = makeReply();

    await hook({ url: '/ready?probe=1', method: 'GET', headers: {}, ip: '127.0.0.1' }, reply);

    expect(reply.status).not.toHaveBeenCalled();
  });
});
