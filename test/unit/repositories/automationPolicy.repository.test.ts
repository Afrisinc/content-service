import { describe, expect, it, vi } from 'vitest';
import { AutomationPolicyRepository } from '@/repositories/automationPolicy.repository';

const client = {
  automationPolicy: {
    findMany: vi.fn(async () => []),
    upsert: vi.fn(async () => ({})),
  },
};

describe('AutomationPolicyRepository agent settings', () => {
  const repository = new AutomationPolicyRepository(client as never);
  const select = { userId: true, mode: true, pausedUntil: true, agents: true };

  it('finds live autopilot policies with their switches', async () => {
    const now = new Date('2026-09-24T10:00:00.000Z');

    await repository.findRunnablePolicies(now);

    expect(client.automationPolicy.findMany).toHaveBeenCalledWith({
      where: {
        mode: 'autopilot',
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
      },
      select,
      take: 200,
    });
  });

  it('reads every policy, newest first and bounded, for workspace agents', async () => {
    await repository.findAgentSnapshots();

    expect(client.automationPolicy.findMany).toHaveBeenLastCalledWith({
      select,
      orderBy: { updatedAt: 'desc' },
      take: 1000,
    });
  });

  it('creates the policy on first save and replaces the switches afterwards', async () => {
    await repository.saveAgentChoices('u1', { news: true });

    expect(client.automationPolicy.upsert).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      create: { userId: 'u1', agents: { news: true } },
      update: { agents: { news: true } },
    });
  });
});
