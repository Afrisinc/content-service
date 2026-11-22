import { beforeEach, describe, expect, it, vi } from 'vitest';

const service = vi.hoisted(() => ({ list: vi.fn(), save: vi.fn() }));
const success = vi.hoisted(() => vi.fn());

vi.mock('@/services/aiProviderConfig.service', () => ({ aiProviderConfigService: service }));
vi.mock('@/utils/apiResponse', () => ({
  ApiResponseHelper: { success },
  ResponseCode: { SUCCESS: 1000, UPDATED: 1002 },
}));

const { listAiProviderConfigs, saveAiProviderConfig } =
  await import('@/controllers/aiProviderConfig.controller');

const reply = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('aiProviderConfig controller', () => {
  it('returns the listed configs', async () => {
    service.list.mockResolvedValue([{ id: 'cfg-1' }]);

    await listAiProviderConfigs({} as never, reply);

    expect(success).toHaveBeenCalledWith(
      reply,
      expect.any(String),
      { configs: [{ id: 'cfg-1' }] },
      1000,
      200
    );
  });

  it('saves with the route params, body and acting admin', async () => {
    service.save.mockResolvedValue({ id: 'cfg-1' });
    const request = {
      params: { provider: 'openai', purpose: 'image' },
      body: { apiKey: 'sk-new-key-98765', model: 'dall-e-3' },
      user: { userId: 'admin-1' },
    } as never;

    await saveAiProviderConfig(request, reply);

    expect(service.save).toHaveBeenCalledWith(
      'openai',
      'image',
      { apiKey: 'sk-new-key-98765', model: 'dall-e-3' },
      'admin-1'
    );
    expect(success).toHaveBeenCalledWith(reply, expect.any(String), { id: 'cfg-1' }, 1002, 200);
  });
});
