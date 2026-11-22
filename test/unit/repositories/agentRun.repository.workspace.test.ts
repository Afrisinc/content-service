import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunRepository } from '@/repositories/agentRun.repository';

const agentRun = {
  findMany: vi.fn(async () => []),
  findFirst: vi.fn(async () => null),
  count: vi.fn(async () => 0),
  groupBy: vi.fn(async () => []),
  deleteMany: vi.fn(async () => ({ count: 1 })),
};

describe('AgentRunRepository shared run log', () => {
  const repository = new AgentRunRepository({ agentRun } as never);
  const owners = ['u1', 'workspace'];

  beforeEach(() => vi.clearAllMocks());

  it('lists a user and extra owners together when asked', async () => {
    await repository.list({ userId: 'u1', alsoOwnedBy: ['workspace'], agent: 'news' });

    expect(agentRun.findMany.mock.calls[0][0].where).toEqual({
      userId: { in: owners },
      agent: 'news',
    });
  });

  it('keeps listing a single user when no extra owners are given', async () => {
    await repository.list({ userId: 'u1' });

    expect(agentRun.findMany.mock.calls[0][0].where).toEqual({ userId: 'u1' });
  });

  it('finds a run visible to any of the owners', async () => {
    await repository.findByIdForOwners('run-1', owners);

    expect(agentRun.findFirst.mock.calls[0][0].where).toEqual({
      id: 'run-1',
      userId: { in: owners },
    });
  });

  it('counts today by status, optionally for one agent', async () => {
    agentRun.groupBy.mockResolvedValueOnce([
      { status: 'succeeded', _count: { _all: 3 } },
      { status: 'failed', _count: { _all: 1 } },
    ] as never);
    const since = new Date('2026-09-24T00:00:00Z');

    await expect(repository.summariseForOwners(owners, since, 'news')).resolves.toEqual({
      succeeded: 3,
      failed: 1,
    });
    expect(agentRun.groupBy.mock.calls[0][0].where).toEqual({
      userId: { in: owners },
      startedAt: { gte: since },
      agent: 'news',
    });
  });

  it('counts runs per agent since a moment', async () => {
    agentRun.groupBy.mockResolvedValueOnce([{ agent: 'news', _count: { _all: 5 } }] as never);

    await expect(repository.countByAgentSince(owners, new Date())).resolves.toEqual({ news: 5 });
  });

  it('reads the newest run of each agent', async () => {
    await repository.findLatestPerAgent(owners);

    expect(agentRun.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: { in: owners } },
      distinct: ['agent'],
      orderBy: { startedAt: 'desc' },
    });
  });

  it('discards a run', async () => {
    await repository.discard('run-1');

    expect(agentRun.deleteMany).toHaveBeenCalledWith({ where: { id: 'run-1' } });
  });
});
