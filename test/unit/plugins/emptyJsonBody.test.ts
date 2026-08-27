import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { registerEmptyJsonBodyParser } from '@/plugins/emptyJsonBody';

async function buildApp() {
  const app = Fastify();
  await registerEmptyJsonBodyParser(app);
  app.post('/echo', (request, reply) => {
    reply.send({ body: request.body ?? null });
  });
  app.setErrorHandler((error, _request, reply) => {
    reply.status((error as { statusCode?: number }).statusCode ?? 500).send({
      message: error.message,
    });
  });
  return app;
}

describe('registerEmptyJsonBodyParser', () => {
  it('lets an empty body through as undefined instead of rejecting it', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: null });
  });

  it('still parses a real JSON body normally', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: { hello: 'world' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ body: { hello: 'world' } });
  });

  it('still rejects malformed JSON with a 400, matching the default parser', async () => {
    const app = await buildApp();

    const response = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{not json',
    });

    expect(response.statusCode).toBe(400);
  });
});
