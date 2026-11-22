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

    expect(await service.getNewsSettings()).toEqual({ batchSize: 2, days: [0, 1, 2, 3, 4, 5, 6] });
  });

  it('uses the server default when nothing has been saved', async () => {
    repository.findByKey.mockResolvedValue(null);
    envMock.NEWS_ENHANCE_BATCH_SIZE = 3;

    expect(await service.getNewsSettings()).toEqual({ batchSize: 3, days: [0, 1, 2, 3, 4, 5, 6] });
  });

  it('degrades to the server default when the lookup fails', async () => {
    repository.findByKey.mockRejectedValue(new Error('db down'));

    expect(await service.getNewsSettings()).toEqual({ batchSize: 1, days: [0, 1, 2, 3, 4, 5, 6] });
  });
});

describe('AgentSettingsService.saveNewsSettings', () => {
  it('saves an allowed batch size for the acting user', async () => {
    repository.findByKey.mockResolvedValue(null);
    repository.save.mockResolvedValue({ settings: { batchSize: 2 } });

    expect(await service.saveNewsSettings(2, 'user-1')).toEqual({
      batchSize: 2,
      days: [0, 1, 2, 3, 4, 5, 6],
    });
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

describe('AgentSettingsService run days', () => {
  it('returns the saved days', async () => {
    repository.findByKey.mockResolvedValue({ settings: { batchSize: 1, days: [1] } });

    expect((await service.getNewsSettings()).days).toEqual([1]);
  });

  it('saves the chosen days, sorted, with the batch size', async () => {
    repository.findByKey.mockResolvedValue(null);
    repository.save.mockResolvedValue({ settings: { batchSize: 1, days: [1, 4] } });

    const saved = await service.saveNewsSettings(1, 'user-1', [4, 1]);

    expect(repository.save).toHaveBeenCalledWith('news', { batchSize: 1, days: [1, 4] }, 'user-1');
    expect(saved.days).toEqual([1, 4]);
  });

  it('keeps the saved days when only the batch size changes', async () => {
    repository.findByKey.mockResolvedValue({ settings: { batchSize: 1, days: [2, 5] } });
    repository.save.mockResolvedValue({ settings: { batchSize: 2, days: [2, 5] } });

    await service.saveNewsSettings(2, 'user-1');

    expect(repository.save).toHaveBeenCalledWith('news', { batchSize: 2, days: [2, 5] }, 'user-1');
  });

  it('rejects an empty list of days and saves nothing', async () => {
    await expect(service.saveNewsSettings(1, 'user-1', [])).rejects.toThrow(BadRequestError);

    expect(repository.save).not.toHaveBeenCalled();
  });
});
