import {
  NotifyAuthenticationError,
  NotifyError,
  NotifyNetworkError,
  NotifyRateLimitError,
  NotifyValidationError,
} from '@afrisinc/notify-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  bulk: vi.fn(),
  getNotifySdk: vi.fn(),
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

vi.mock('@/adapters/notify/notifySdk', () => ({ getNotifySdk: mocks.getNotifySdk }));
vi.mock('@/utils/cache', () => ({ cacheGet: mocks.cacheGet, cacheSet: mocks.cacheSet }));

const { describeNotifyFailure, isChannel, parseChannels, sendBulkNotifications, sendNotification } =
  await import('@/utils/notify');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getNotifySdk.mockReturnValue({ send: mocks.send, bulk: mocks.bulk });
  mocks.send.mockResolvedValue({ id: 'notif-1', status: 'queued' });
  mocks.bulk.mockResolvedValue({ accepted: 2, rejected: 0 });
  mocks.cacheGet.mockResolvedValue(null);
  mocks.cacheSet.mockResolvedValue(undefined);
});

describe('parseChannels', () => {
  it('keeps the channels the API knows about', () => {
    expect(parseChannels(['in_app', 'email', 'sms', 'whatsapp', 'push'])).toEqual([
      'in_app',
      'email',
      'sms',
      'whatsapp',
      'push',
    ]);
  });

  it('drops an unknown channel rather than passing it to the API', () => {
    expect(parseChannels(['email', 'carrier-pigeon'])).toEqual(['email']);
  });

  it('recognises channels individually', () => {
    expect(isChannel('email')).toBe(true);
    expect(isChannel('telegram')).toBe(false);
  });
});

describe('sendNotification', () => {
  it('sends one notification per target', async () => {
    const result = await sendNotification({
      targets: [
        { to: 'user-1', channel: 'in_app' },
        { to: 'user@example.com', channel: 'email' },
      ],
      template: 'post-review-requested',
      data: { topic: 'Design' },
      priority: 'high',
    });

    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send).toHaveBeenCalledWith({
      to: 'user-1',
      channel: 'in_app',
      template: 'post-review-requested',
      data: { topic: 'Design' },
      priority: 'high',
    });
    expect(result).toEqual({
      sent: [
        { id: 'notif-1', status: 'queued' },
        { id: 'notif-1', status: 'queued' },
      ],
      failed: 0,
      skipped: null,
    });
  });

  it('skips without calling the API when Notify is not configured', async () => {
    mocks.getNotifySdk.mockReturnValue(null);

    const result = await sendNotification({ targets: [{ to: 'user-1', channel: 'in_app' }] });

    expect(result).toEqual({ sent: [], failed: 0, skipped: 'not-configured' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('skips when there is no reachable target', async () => {
    const result = await sendNotification({ targets: [] });

    expect(result).toEqual({ sent: [], failed: 0, skipped: 'no-targets' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('does not repeat a notification that has already gone out', async () => {
    mocks.cacheGet.mockResolvedValue(Date.now());

    const result = await sendNotification({
      targets: [{ to: 'user-1', channel: 'in_app' }],
      dedupeKey: 'notify:post-review:draft-1',
    });

    expect(result.skipped).toBe('duplicate');
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('marks the dedupe key once something was delivered', async () => {
    await sendNotification({
      targets: [{ to: 'user-1', channel: 'in_app' }],
      dedupeKey: 'notify:post-review:draft-1',
      dedupeTtlSeconds: 120,
    });

    expect(mocks.cacheSet).toHaveBeenCalledWith(
      'notify:post-review:draft-1',
      expect.any(Number),
      120
    );
  });

  it('falls back to a day-long dedupe window when none is given', async () => {
    await sendNotification({
      targets: [{ to: 'user-1', channel: 'in_app' }],
      dedupeKey: 'notify:post-review:draft-1',
    });

    expect(mocks.cacheSet).toHaveBeenCalledWith(
      'notify:post-review:draft-1',
      expect.any(Number),
      86400
    );
  });

  it('leaves the dedupe key unset when every channel failed, so the next trigger retries', async () => {
    mocks.send.mockRejectedValue(new NotifyNetworkError('offline'));

    const result = await sendNotification({
      targets: [{ to: 'user-1', channel: 'in_app' }],
      dedupeKey: 'notify:post-review:draft-1',
    });

    expect(result).toEqual({ sent: [], failed: 1, skipped: null });
    expect(mocks.cacheSet).not.toHaveBeenCalled();
  });

  it('delivers on the channels that work when one of them fails', async () => {
    mocks.send
      .mockRejectedValueOnce(new NotifyValidationError('bad address'))
      .mockResolvedValueOnce({ id: 'notif-2', status: 'sent' });

    const result = await sendNotification({
      targets: [
        { to: 'not-an-email', channel: 'email' },
        { to: 'user-1', channel: 'in_app' },
      ],
    });

    expect(result.sent).toEqual([{ id: 'notif-2', status: 'sent' }]);
    expect(result.failed).toBe(1);
  });

  it('never throws when the API is down', async () => {
    mocks.send.mockRejectedValue(new Error('socket hang up'));

    await expect(
      sendNotification({ targets: [{ to: 'user-1', channel: 'in_app' }] })
    ).resolves.toMatchObject({ failed: 1 });
  });
});

describe('sendBulkNotifications', () => {
  it('hands the batch to the bulk endpoint', async () => {
    const result = await sendBulkNotifications([
      { to: 'a@example.com', channel: 'email' },
      { to: 'b@example.com', channel: 'email' },
    ]);

    expect(mocks.bulk).toHaveBeenCalledOnce();
    expect(result).toEqual({ accepted: 2, rejected: 0, skipped: null });
  });

  it('chunks to the thousand-per-call ceiling', async () => {
    mocks.bulk.mockResolvedValue({ accepted: 1000, rejected: 0 });

    const notifications = Array.from({ length: 1001 }, (_, index) => ({
      to: `user-${index}`,
      channel: 'in_app' as const,
    }));
    await sendBulkNotifications(notifications);

    expect(mocks.bulk).toHaveBeenCalledTimes(2);
    expect(mocks.bulk.mock.calls[0][0].notifications).toHaveLength(1000);
    expect(mocks.bulk.mock.calls[1][0].notifications).toHaveLength(1);
  });

  it('counts a failed chunk as rejected instead of throwing', async () => {
    mocks.bulk.mockRejectedValue(new NotifyRateLimitError('slow down', 30));

    const result = await sendBulkNotifications([{ to: 'a@example.com', channel: 'email' }]);

    expect(result).toEqual({ accepted: 0, rejected: 1, skipped: null });
  });

  it('skips when Notify is not configured', async () => {
    mocks.getNotifySdk.mockReturnValue(null);

    const result = await sendBulkNotifications([{ to: 'a@example.com', channel: 'email' }]);

    expect(result).toEqual({ accepted: 0, rejected: 0, skipped: 'not-configured' });
    expect(mocks.bulk).not.toHaveBeenCalled();
  });

  it('skips an empty batch', async () => {
    const result = await sendBulkNotifications([]);

    expect(result).toEqual({ accepted: 0, rejected: 0, skipped: 'no-targets' });
    expect(mocks.bulk).not.toHaveBeenCalled();
  });
});

describe('describeNotifyFailure', () => {
  it('names each typed SDK failure without leaking the recipient', () => {
    expect(describeNotifyFailure(new NotifyAuthenticationError())).toBe('authentication-failed');
    expect(describeNotifyFailure(new NotifyValidationError('to is required'))).toContain(
      'validation-failed'
    );
    expect(describeNotifyFailure(new NotifyRateLimitError('slow down', 30))).toBe(
      'rate-limited: retry after 30s'
    );
    expect(describeNotifyFailure(new NotifyRateLimitError('slow down'))).toBe('rate-limited');
    expect(describeNotifyFailure(new NotifyNetworkError('offline'))).toBe('network-error');
    expect(describeNotifyFailure(new NotifyError('boom', 'unknown_error'))).toBe('unknown_error');
  });

  it('falls back to the message for anything that is not a Notify error', () => {
    expect(describeNotifyFailure(new Error('socket hang up'))).toBe('socket hang up');
    expect(describeNotifyFailure('exploded')).toBe('exploded');
    expect(describeNotifyFailure({ nope: true })).toBe('unknown-error');
  });
});
