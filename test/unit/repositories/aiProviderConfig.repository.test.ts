import { beforeEach, describe, expect, it, vi } from 'vitest';

const model = vi.hoisted(() => ({
  findMany: vi.fn(async () => []),
  findUnique: vi.fn(async () => null),
  create: vi.fn(async () => ({ id: 'cfg-1' })),
  update: vi.fn(async () => ({ id: 'cfg-1' })),
}));

vi.mock('@/database/prismaClient', () => ({ prisma: { aiProviderConfig: model } }));

const { AiProviderConfigRepository } = await import('@/repositories/aiProviderConfig.repository');

let repository: InstanceType<typeof AiProviderConfigRepository>;

beforeEach(() => {
  vi.clearAllMocks();
  repository = new AiProviderConfigRepository();
});

describe('AiProviderConfigRepository', () => {
  it('lists configs in a stable, bounded order', async () => {
    await repository.findAll();

    expect(model.findMany).toHaveBeenCalledWith({
      orderBy: [{ provider: 'asc' }, { purpose: 'asc' }],
      take: 100,
    });
  });

  it('finds a config by its provider and purpose key', async () => {
    await repository.findByProviderAndPurpose('openai', 'image');

    expect(model.findUnique).toHaveBeenCalledWith({
      where: { provider_purpose: { provider: 'openai', purpose: 'image' } },
    });
  });

  it('creates a config under its provider and purpose', async () => {
    await repository.create('anthropic', 'text', { apiKeyEnc: 'enc', apiKeyHint: 'sk-…1234' });

    expect(model.create).toHaveBeenCalledWith({
      data: { provider: 'anthropic', purpose: 'text', apiKeyEnc: 'enc', apiKeyHint: 'sk-…1234' },
    });
  });

  it('updates a config by its provider and purpose key', async () => {
    await repository.update('anthropic', 'text', { isActive: false });

    expect(model.update).toHaveBeenCalledWith({
      where: { provider_purpose: { provider: 'anthropic', purpose: 'text' } },
      data: { isActive: false },
    });
  });
});
