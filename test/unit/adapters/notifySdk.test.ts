import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  Notify: vi.fn(),
  send: vi.fn(),
  bulk: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  campaignsCreate: vi.fn(),
}));

const envMock = vi.hoisted(() => ({
  NOTIFY_API_KEY: 'nf_test_key',
}));

vi.mock('@afrisinc/notify-sdk', async importOriginal => ({
  ...(await importOriginal<typeof import('@afrisinc/notify-sdk')>()),
  Notify: mocks.Notify,
}));
vi.mock('@/config/env', () => ({ env: envMock }));

const { getNotifySdk, isNotifyConfigured, notify, resetNotifySdk } =
  await import('@/adapters/notify/notifySdk');
const {
  NotifyAuthenticationError,
  NotifyError,
  NotifyNetworkError,
  NotifyRateLimitError,
  NotifyValidationError,
} = await import('@afrisinc/notify-sdk');

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NOTIFY_API_KEY = 'nf_test_key';
  mocks.Notify.mockImplementation(() => ({
    send: mocks.send,
    bulk: mocks.bulk,
    get: mocks.get,
    list: mocks.list,
    campaigns: { create: mocks.campaignsCreate },
  }));
  resetNotifySdk();
});

describe('isNotifyConfigured', () => {
  it('needs an api key', () => {
    expect(isNotifyConfigured()).toBe(true);

    envMock.NOTIFY_API_KEY = '';
    expect(isNotifyConfigured()).toBe(false);
  });
});

describe('getNotifySdk', () => {
  it('builds the client from the configured api key, leaving the rest to SDK defaults', () => {
    expect(getNotifySdk()).not.toBeNull();
    expect(mocks.Notify).toHaveBeenCalledWith({ apiKey: 'nf_test_key' });
  });

  it('builds the client once and reuses it', () => {
    getNotifySdk();
    getNotifySdk();

    expect(mocks.Notify).toHaveBeenCalledOnce();
  });

  it('hands back nothing to construct when there is no api key', () => {
    envMock.NOTIFY_API_KEY = '';

    expect(getNotifySdk()).toBeNull();
    expect(mocks.Notify).not.toHaveBeenCalled();
  });

  it('rebuilds from the current config after a reset', () => {
    getNotifySdk();
    resetNotifySdk();
    getNotifySdk();

    expect(mocks.Notify).toHaveBeenCalledTimes(2);
  });
});

describe('notify.send', () => {
  const params = { to: 'user@example.com', channel: 'email' } as const;

  it('sends through the configured client', async () => {
    mocks.send.mockResolvedValue({ id: 'notif-1', status: 'queued' });

    await expect(notify.send(params)).resolves.toEqual({ id: 'notif-1', status: 'queued' });
    expect(mocks.send).toHaveBeenCalledWith(params);
  });

  it('rejects, rather than throwing synchronously, when notify is not configured', async () => {
    envMock.NOTIFY_API_KEY = '';

    await expect(notify.send(params)).rejects.toThrow('Notify is not configured');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it.each([
    ['authentication error', new NotifyAuthenticationError('bad key')],
    ['validation error', new NotifyValidationError('bad address')],
    ['rate limit error', new NotifyRateLimitError('slow down', 30)],
    ['network error', new NotifyNetworkError('timeout')],
    ['generic notify error', new NotifyError('boom', 'UNKNOWN')],
    ['unrecognized error', new Error('plain failure')],
  ])('logs and rethrows on %s', async (_label, error) => {
    mocks.send.mockRejectedValue(error);

    await expect(notify.send(params)).rejects.toBe(error);
  });
});

describe('notify.bulk', () => {
  it('sends through the configured client', async () => {
    mocks.bulk.mockResolvedValue({ accepted: 1, rejected: 0 });

    const params = { notifications: [{ to: 'user@example.com', channel: 'email' as const }] };

    await expect(notify.bulk(params)).resolves.toEqual({ accepted: 1, rejected: 0 });
    expect(mocks.bulk).toHaveBeenCalledWith(params);
  });

  it('logs and rethrows on failure', async () => {
    const error = new NotifyRateLimitError('slow down', 30);
    mocks.bulk.mockRejectedValue(error);

    await expect(notify.bulk({ notifications: [] })).rejects.toBe(error);
  });
});

describe('notify.get', () => {
  it('fetches through the configured client', async () => {
    mocks.get.mockResolvedValue({ id: 'notif-1', status: 'sent' });

    await expect(notify.get('notif-1')).resolves.toEqual({ id: 'notif-1', status: 'sent' });
    expect(mocks.get).toHaveBeenCalledWith('notif-1');
  });

  it('logs and rethrows on failure', async () => {
    const error = new Error('boom');
    mocks.get.mockRejectedValue(error);

    await expect(notify.get('notif-1')).rejects.toBe(error);
  });
});

describe('notify.list', () => {
  it('lists through the configured client', async () => {
    mocks.list.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });

    await expect(notify.list()).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });
});

describe('notify.campaigns.create', () => {
  const params = {
    name: 'launch',
    channel: 'email' as const,
    subject: 'hi',
    html_content: '<p>hi</p>',
    recipientType: 'all' as const,
  };

  it('creates through the configured client, chaining into the nested resource', async () => {
    mocks.campaignsCreate.mockResolvedValue({ id: 'camp-1' });

    await expect(notify.campaigns.create(params)).resolves.toEqual({ id: 'camp-1' });
    expect(mocks.campaignsCreate).toHaveBeenCalledWith(params);
  });

  it('rejects, rather than throwing synchronously, when notify is not configured', async () => {
    envMock.NOTIFY_API_KEY = '';

    await expect(notify.campaigns.create(params)).rejects.toThrow('Notify is not configured');
    expect(mocks.campaignsCreate).not.toHaveBeenCalled();
  });

  it('logs and rethrows on failure', async () => {
    const error = new NotifyValidationError('bad subject');
    mocks.campaignsCreate.mockRejectedValue(error);

    await expect(notify.campaigns.create(params)).rejects.toBe(error);
  });
});
