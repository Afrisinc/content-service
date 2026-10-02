import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestError } from '@/utils/http-error';

const envMock = vi.hoisted(() => ({ NEWS_ENHANCE_BATCH_SIZE: 1 }));
const repository = vi.hoisted(() => ({ findByKey: vi.fn(), save: vi.fn() }));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/repositories/agentSetting.repository', () => ({
  agentSettingRepository: repository,
}));

const { AgentSettingsService } = await import('@/services/agentSettings.service');

let service: InstanceType<typeof AgentSettingsService>;

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NEWS_ENHANCE_BATCH_SIZE = 1;
  service = new AgentSettingsService(repository as never);
});

describe('AgentSettingsService.getNewsSettings', () => {
  it('returns the saved batch size', async () => {
    repository.findByKey.mockResolvedValue({ settings: { batchSize: 2 } });

    expect(await service.getNewsSettings()).toEqual({ batchSize: 2 });
  });

  it('uses the server default when nothing has been saved', async () => {
    repository.findByKey.mockResolvedValue(null);
    envMock.NEWS_ENHANCE_BATCH_SIZE = 3;

    expect(await service.getNewsSettings()).toEqual({ batchSize: 3 });
  });

  it('degrades to the server default when the lookup fails', async () => {
    repository.findByKey.mockRejectedValue(new Error('db down'));

    expect(await service.getNewsSettings()).toEqual({ batchSize: 1 });
  });
});

describe('AgentSettingsService.saveNewsSettings', () => {
  it('saves an allowed batch size for the acting user', async () => {
    repository.findByKey.mockResolvedValue(null);
    repository.save.mockResolvedValue({ settings: { batchSize: 2 } });

    expect(await service.saveNewsSettings(2, 'user-1')).toEqual({ batchSize: 2 });
    expect(repository.save).toHaveBeenCalledWith('news', { batchSize: 2 }, 'user-1');
  });

  it('keeps any other saved settings when it changes the batch size', async () => {
    repository.findByKey.mockResolvedValue({ settings: { batchSize: 1, other: 'kept' } });
    repository.save.mockResolvedValue({ settings: { batchSize: 2, other: 'kept' } });

    await service.saveNewsSettings(2, 'user-1');

    expect(repository.save).toHaveBeenCalledWith('news', { batchSize: 2, other: 'kept' }, 'user-1');
  });

  it.each([0, 3, 10, 1.5, -1])('rejects %s and saves nothing', async batchSize => {
    await expect(service.saveNewsSettings(batchSize, 'user-1')).rejects.toThrow(BadRequestError);

    expect(repository.findByKey).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });
});
