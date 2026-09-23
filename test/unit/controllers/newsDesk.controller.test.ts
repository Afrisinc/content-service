import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';

const service = vi.hoisted(() => ({
  list: vi.fn(),
  summary: vi.fn(),
  get: vi.fn(),
  requeue: vi.fn(),
  skip: vi.fn(),
  setFeatured: vi.fn(),
  triggerStage: vi.fn(),
}));

vi.mock('@/services/newsDesk.service', () => ({ newsDeskService: service }));

const controller = await import('@/controllers/newsDesk.controller');

function fakeReply() {
  const reply = { status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

const request = (parts: Partial<FastifyRequest>) => parts as FastifyRequest;

describe('news desk controller', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists articles with the query as given and serialises bigint ids', async () => {
    service.list.mockResolvedValue({ items: [{ id: 5n }], total: 1, page: 1, limit: 12 });
    const reply = fakeReply();

    await controller.listNewsDeskArticles(
      request({ query: { status: 'failed' } }),
      reply as unknown as FastifyReply
    );

    expect(service.list).toHaveBeenCalledWith({ status: 'failed' });
    expect(reply.status).toHaveBeenCalledWith(200);
    expect(reply.send.mock.calls[0][0].data.items[0].id).toBe('5');
  });

  it('returns the summary', async () => {
    service.summary.mockResolvedValue({ total: 3 });
    const reply = fakeReply();

    await controller.getNewsDeskSummary(request({}), reply as unknown as FastifyReply);

    expect(reply.send.mock.calls[0][0]).toMatchObject({ success: true, data: { total: 3 } });
  });

  it.each([
    ['getNewsDeskArticle', 'get'],
    ['requeueNewsDeskArticle', 'requeue'],
    ['skipNewsDeskArticle', 'skip'],
  ] as const)('%s passes the route id to the service', async (handler, method) => {
    service[method].mockResolvedValue({ id: 9n });
    const reply = fakeReply();

    await controller[handler](request({ params: { id: '9' } }), reply as unknown as FastifyReply);

    expect(service[method]).toHaveBeenCalledWith('9');
    expect(reply.status).toHaveBeenCalledWith(200);
  });

  it.each([
    [true, 'Article featured'],
    [false, 'Article unfeatured'],
  ])('feature=%s updates the flag and says so', async (featured, message) => {
    service.setFeatured.mockResolvedValue({ id: 9n, is_featured: featured });
    const reply = fakeReply();

    await controller.featureNewsDeskArticle(
      request({ params: { id: '9' }, body: { featured } }),
      reply as unknown as FastifyReply
    );

    expect(service.setFeatured).toHaveBeenCalledWith('9', featured);
    expect(reply.send.mock.calls[0][0].resp_msg).toBe(message);
  });

  it('starts a pipeline stage and answers 202', async () => {
    service.triggerStage.mockReturnValue({ stage: 'ingest', started: true });
    const reply = fakeReply();

    await controller.runNewsAgentStage(
      request({ params: { stage: 'ingest' } }),
      reply as unknown as FastifyReply
    );

    expect(service.triggerStage).toHaveBeenCalledWith('ingest');
    expect(reply.status).toHaveBeenCalledWith(202);
  });
});
