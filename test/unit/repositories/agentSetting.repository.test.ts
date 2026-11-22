import { beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  findUnique: vi.fn(async () => null),
  upsert: vi.fn(async () => ({ agentKey: 'news' })),
}));

vi.mock('@/database/prismaClient', () => ({ prisma: { agentSetting: model } }));

const { AgentSettingRepository } = await import('@/repositories/agentSetting.repository');

let repository: InstanceType<typeof AgentSettingRepository>;

beforeEach(() => {
  vi.clearAllMocks();
  repository = new AgentSettingRepository();
});

describe('AgentSettingRepository', () => {
  it('finds the settings row by agent key', async () => {
    await repository.findByKey('news');

    expect(model.findUnique).toHaveBeenCalledWith({ where: { agentKey: 'news' } });
  });

  it('creates or replaces the row for an agent and records who changed it', async () => {
    await repository.save('news', { batchSize: 2 }, 'user-1');

    expect(model.upsert).toHaveBeenCalledWith({
      where: { agentKey: 'news' },
      create: { agentKey: 'news', settings: { batchSize: 2 }, updatedBy: 'user-1' },
      update: { settings: { batchSize: 2 }, updatedBy: 'user-1' },
    });
  });
});
