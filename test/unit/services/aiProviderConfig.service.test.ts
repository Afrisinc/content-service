import { beforeEach, describe, expect, it, vi } from 'vitest';

const repository = vi.hoisted(() => ({
  findAll: vi.fn(),
  findByProviderAndPurpose: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/repositories/aiProviderConfig.repository', () => ({
  aiProviderConfigRepository: repository,
}));
vi.mock('@/utils/crypto', () => ({
  encrypt: (value: string) => `enc(${value})`,
  decrypt: (value: string) => value.replace(/^enc\(|\)$/g, ''),
}));

const { AiProviderConfigService, maskApiKey, toAiProviderConfigDTO } =
  await import('@/services/aiProviderConfig.service');

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cfg-1',
    provider: 'anthropic',
    purpose: 'text',
    model: 'claude-sonnet-5-5',
    baseUrl: null,
    organizationId: null,
    projectId: null,
    apiKeyEnc: 'enc(sk-ant-secret-key-1234)',
    apiKeyHint: 'sk-…1234',
    isActive: true,
    lastRotatedAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedBy: 'admin-1',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('maskApiKey', () => {
  it('keeps only the edges of a long key', () => {
    expect(maskApiKey('sk-ant-secret-key-1234')).toBe('sk-…1234');
  });

  it('hides a short key entirely', () => {
    expect(maskApiKey('short')).toBe('••••');
  });
});

describe('toAiProviderConfigDTO', () => {
  it('never exposes the encrypted key', () => {
    const dto = toAiProviderConfigDTO(row() as never);

    expect(dto).not.toHaveProperty('apiKeyEnc');
    expect(dto).toMatchObject({
      id: 'cfg-1',
      apiKeyHint: 'sk-…1234',
      lastRotatedAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-02T00:00:00.000Z',
    });
  });
});

describe('AiProviderConfigService.list', () => {
  it('maps every stored row to a DTO', async () => {
    repository.findAll.mockResolvedValue([row(), row({ id: 'cfg-2', provider: 'openai' })]);

    const configs = await new AiProviderConfigService().list();

    expect(configs.map(config => config.id)).toEqual(['cfg-1', 'cfg-2']);
  });
});

describe('AiProviderConfigService.save', () => {
  it('creates a config with the key encrypted and masked', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(null);
    repository.create.mockResolvedValue(row());

    const dto = await new AiProviderConfigService().save(
      'anthropic',
      'text',
      { apiKey: '  sk-ant-secret-key-1234  ', model: 'claude-sonnet-5-5' },
      'admin-1'
    );

    expect(repository.create).toHaveBeenCalledWith(
      'anthropic',
      'text',
      expect.objectContaining({
        apiKeyEnc: 'enc(sk-ant-secret-key-1234)',
        apiKeyHint: 'sk-…1234',
        model: 'claude-sonnet-5-5',
        updatedBy: 'admin-1',
      })
    );
    expect(dto.apiKeyHint).toBe('sk-…1234');
  });

  it('rejects creation without an api key and persists nothing', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(null);

    await expect(
      new AiProviderConfigService().save('openai', 'text', { model: 'gpt-4o' }, 'admin-1')
    ).rejects.toThrow('apiKey is required');

    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('rotates the key and timestamp when an api key is sent for an existing config', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row());
    repository.update.mockResolvedValue(row());

    await new AiProviderConfigService().save(
      'anthropic',
      'text',
      { apiKey: 'sk-new-key-98765' },
      'admin-2'
    );

    const [, , data] = repository.update.mock.calls[0];
    expect(data).toMatchObject({
      apiKeyEnc: 'enc(sk-new-key-98765)',
      apiKeyHint: 'sk-…8765',
      updatedBy: 'admin-2',
    });
    expect(data.lastRotatedAt).toBeInstanceOf(Date);
  });

  it('leaves the stored key untouched when only settings change', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row());
    repository.update.mockResolvedValue(row({ isActive: false }));

    await new AiProviderConfigService().save('anthropic', 'text', { isActive: false }, 'admin-1');

    const [, , data] = repository.update.mock.calls[0];
    expect(data).not.toHaveProperty('apiKeyEnc');
    expect(data).not.toHaveProperty('lastRotatedAt');
    expect(data.isActive).toBe(false);
  });
});

describe('AiProviderConfigService.resolve', () => {
  it('decrypts the stored key and maps empty fields to undefined', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row({ baseUrl: 'https://gw.example' }));

    const resolved = await new AiProviderConfigService().resolve('anthropic', 'text');

    expect(resolved).toEqual({
      apiKey: 'sk-ant-secret-key-1234',
      baseUrl: 'https://gw.example',
      organizationId: undefined,
      projectId: undefined,
      model: 'claude-sonnet-5-5',
    });
  });

  it('returns null when no config exists', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(null);

    expect(await new AiProviderConfigService().resolve('openai', 'image')).toBeNull();
  });

  it('returns null for an inactive config', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row({ isActive: false }));

    expect(await new AiProviderConfigService().resolve('anthropic', 'text')).toBeNull();
  });

  it('serves repeat lookups from the cache', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row());
    const service = new AiProviderConfigService();

    await service.resolve('anthropic', 'text');
    await service.resolve('anthropic', 'text');

    expect(repository.findByProviderAndPurpose).toHaveBeenCalledTimes(1);
  });

  it('refreshes after the cache entry expires', async () => {
    vi.useFakeTimers();
    repository.findByProviderAndPurpose.mockResolvedValue(row());
    const service = new AiProviderConfigService();

    await service.resolve('anthropic', 'text');
    vi.advanceTimersByTime(61_000);
    await service.resolve('anthropic', 'text');
    vi.useRealTimers();

    expect(repository.findByProviderAndPurpose).toHaveBeenCalledTimes(2);
  });

  it('applies a saved rotation on the next lookup without waiting for expiry', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row());
    repository.update.mockResolvedValue(row());
    const service = new AiProviderConfigService();

    await service.resolve('anthropic', 'text');
    await service.save('anthropic', 'text', { apiKey: 'sk-new-key-98765' }, 'admin-1');
    await service.resolve('anthropic', 'text');

    expect(repository.findByProviderAndPurpose).toHaveBeenCalledTimes(3);
  });

  it('degrades to null and does not cache a failed lookup', async () => {
    repository.findByProviderAndPurpose
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValueOnce(row());
    const service = new AiProviderConfigService();

    expect(await service.resolve('anthropic', 'text')).toBeNull();
    expect(await service.resolve('anthropic', 'text')).toMatchObject({
      apiKey: 'sk-ant-secret-key-1234',
    });
  });

  it('degrades to null when the stored key cannot be decrypted', async () => {
    repository.findByProviderAndPurpose.mockResolvedValue(row({ apiKeyEnc: null }));

    expect(await new AiProviderConfigService().resolve('anthropic', 'text')).toBeNull();
  });
});
