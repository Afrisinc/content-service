import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAiUsageSummary,
  getUserQuota,
  getUserUsageLogs,
} from '@/controllers/aiUsage.controller';
import type { FastifyReply, FastifyRequest } from 'fastify';

const service = vi.hoisted(() => ({
  getSummary: vi.fn(),
  getUserQuota: vi.fn(),
  listUserUsage: vi.fn(),
}));

vi.mock('@/services/aiUsage.service', async () => {
  const actual = await vi.importActual<typeof import('@/services/aiUsage.service')>(
    '@/services/aiUsage.service'
  );
  return { aiUsageService: service, resolveRange: actual.resolveRange };
});

function fakeReply() {
  const reply = {
    status: vi.fn(() => reply),
    send: vi.fn(() => reply),
  };
  return reply as unknown as FastifyReply & { send: ReturnType<typeof vi.fn> };
}

const request = (parts: Partial<FastifyRequest>) => parts as FastifyRequest;

beforeEach(() => {
  vi.clearAllMocks();
  service.getSummary.mockResolvedValue({ totals: {} });
  service.getUserQuota.mockResolvedValue({ userId: 'user-1' });
  service.listUserUsage.mockResolvedValue({ data: [], pagination: {} });
});

describe('getAiUsageSummary', () => {
  it('passes the requested range through and answers with the standard envelope', async () => {
    const reply = fakeReply();

    await getAiUsageSummary(
      request({ query: { from: '2026-08-01T00:00:00Z', to: '2026-08-10T00:00:00Z' } }),
      reply
    );

    expect(service.getSummary).toHaveBeenCalledWith({
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-10T00:00:00Z'),
    });
    expect(reply.send).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, resp_msg: 'AI usage summary retrieved' })
    );
  });

  it('rejects a date it cannot parse', async () => {
    await expect(
      getAiUsageSummary(request({ query: { from: 'last tuesday' } }), fakeReply())
    ).rejects.toThrow('from and to must be ISO dates');
    expect(service.getSummary).not.toHaveBeenCalled();
  });

  it('rejects a range that runs backwards', async () => {
    await expect(
      getAiUsageSummary(
        request({ query: { from: '2026-08-10T00:00:00Z', to: '2026-08-01T00:00:00Z' } }),
        fakeReply()
      )
    ).rejects.toThrow('from must not be after to');
  });
});

describe('getUserQuota', () => {
  it('reads the quota for the user in the path', async () => {
    await getUserQuota(request({ params: { userId: 'user-1' } }), fakeReply());

    expect(service.getUserQuota).toHaveBeenCalledWith('user-1');
  });

  it('rejects a blank user id', async () => {
    await expect(getUserQuota(request({ params: { userId: '  ' } }), fakeReply())).rejects.toThrow(
      'userId is required'
    );
  });
});

describe('getUserUsageLogs', () => {
  it('applies pagination defaults and passes the range on', async () => {
    await getUserUsageLogs(request({ params: { userId: 'user-1' }, query: {} }), fakeReply());

    expect(service.listUserUsage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', page: 1, limit: 10 })
    );
  });

  it('honours an explicit page and limit', async () => {
    await getUserUsageLogs(
      request({ params: { userId: 'user-1' }, query: { page: '3', limit: '25' } }),
      fakeReply()
    );

    expect(service.listUserUsage).toHaveBeenCalledWith(
      expect.objectContaining({ page: 3, limit: 25 })
    );
  });
});
