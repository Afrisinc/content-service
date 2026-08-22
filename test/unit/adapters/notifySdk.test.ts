import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ Notify: vi.fn() }));

const envMock = vi.hoisted(() => ({
  NOTIFY_API_KEY: 'nf_test_key',
  NOTIFY_API_URL: 'https://notify-api.afrisinc.com',
  NOTIFY_TIMEOUT_MS: 30000,
  NOTIFY_RETRIES: 3,
}));

vi.mock('@afrisinc/notify-sdk', () => ({ Notify: mocks.Notify }));
vi.mock('@/config/env', () => ({ env: envMock }));

const { getNotifySdk, isNotifyConfigured, resetNotifySdk } =
  await import('@/adapters/notify/notifySdk');

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NOTIFY_API_KEY = 'nf_test_key';
  envMock.NOTIFY_API_URL = 'https://notify-api.afrisinc.com';
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
  it('builds the client from the configured credentials', () => {
    expect(getNotifySdk()).not.toBeNull();
    expect(mocks.Notify).toHaveBeenCalledWith({
      apiKey: 'nf_test_key',
      baseUrl: 'https://notify-api.afrisinc.com',
      timeout: 30000,
      retries: 3,
    });
  });

  it('leaves the base url to the SDK when none is configured', () => {
    envMock.NOTIFY_API_URL = '';

    getNotifySdk();

    expect(mocks.Notify.mock.calls[0][0]).not.toHaveProperty('baseUrl');
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
