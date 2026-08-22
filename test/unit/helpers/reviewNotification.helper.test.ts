import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NOTIFY_REVIEW_CHANNELS: ['in_app', 'email'] as string[],
  NOTIFY_DEDUPE_TTL_SECONDS: 86400,
  DASHBOARD_URL: 'https://studio.afrisinc.com',
}));

const mocks = vi.hoisted(() => ({ sendNotification: vi.fn(), findById: vi.fn() }));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/repositories/user.repository', () => ({
  UserRepository: vi.fn(),
  userRepository: { findById: mocks.findById },
}));
vi.mock('@/utils/notify', async importOriginal => ({
  ...(await importOriginal<typeof import('@/utils/notify')>()),
  sendNotification: mocks.sendNotification,
}));

const {
  POST_REVIEW_TEMPLATE,
  buildPostReviewNotification,
  buildReviewTargets,
  postReviewUrl,
  requestPostReview,
} = await import('@/helpers/reviewNotification.helper');

const RECIPIENT = { userId: 'user-1', email: 'editor@example.com', name: 'Amina' };

const NOTICE = {
  draftId: 'draft-1',
  topic: 'Software development',
  format: 'post',
  slideCount: 4,
  postCount: 2,
  scheduledAt: new Date('2026-08-25T09:00:00.000Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  envMock.NOTIFY_REVIEW_CHANNELS = ['in_app', 'email'];
  envMock.DASHBOARD_URL = 'https://studio.afrisinc.com';
  mocks.findById.mockResolvedValue({ id: 'user-1', email: 'editor@example.com', name: 'Amina' });
  mocks.sendNotification.mockResolvedValue({
    sent: [{ id: 'notif-1', status: 'queued' }],
    failed: 0,
    skipped: null,
  });
});

describe('postReviewUrl', () => {
  it('points at the draft on the dashboard', () => {
    expect(postReviewUrl('draft-1')).toBe('https://studio.afrisinc.com/posts/draft-1');
  });

  it('does not double the slash when the configured url has a trailing one', () => {
    envMock.DASHBOARD_URL = 'https://studio.afrisinc.com/';

    expect(postReviewUrl('draft-1')).toBe('https://studio.afrisinc.com/posts/draft-1');
  });
});

describe('buildReviewTargets', () => {
  it('addresses in_app by user id and email by the account address', () => {
    expect(buildReviewTargets(RECIPIENT)).toEqual([
      { channel: 'in_app', to: 'user-1' },
      { channel: 'email', to: 'editor@example.com' },
    ]);
  });

  it('drops the email copy for a user with no address on file', () => {
    expect(buildReviewTargets({ userId: 'user-1', email: null })).toEqual([
      { channel: 'in_app', to: 'user-1' },
    ]);
  });

  it('drops the email copy when the user record was never loaded', () => {
    expect(buildReviewTargets({ userId: 'user-1' })).toEqual([{ channel: 'in_app', to: 'user-1' }]);
  });

  it('drops channels we hold no contact detail for', () => {
    envMock.NOTIFY_REVIEW_CHANNELS = ['sms', 'whatsapp', 'push'];

    expect(buildReviewTargets(RECIPIENT)).toEqual([]);
  });

  it('ignores a channel name the API does not know', () => {
    envMock.NOTIFY_REVIEW_CHANNELS = ['email', 'carrier-pigeon'];

    expect(buildReviewTargets(RECIPIENT)).toEqual([{ channel: 'email', to: 'editor@example.com' }]);
  });

  it('honours an explicit channel list over the configured one', () => {
    expect(buildReviewTargets(RECIPIENT, ['email'])).toEqual([
      { channel: 'email', to: 'editor@example.com' },
    ]);
  });
});

describe('buildPostReviewNotification', () => {
  it('carries everything the template needs to ask for a review', () => {
    const request = buildPostReviewNotification(RECIPIENT, NOTICE);

    expect(request).toMatchObject({
      template: POST_REVIEW_TEMPLATE,
      priority: 'high',
      dedupeKey: 'notify:post-review:draft-1',
      dedupeTtlSeconds: 86400,
      targets: [
        { channel: 'in_app', to: 'user-1' },
        { channel: 'email', to: 'editor@example.com' },
      ],
    });
    expect(request.data).toEqual({
      name: 'Amina',
      draft_id: 'draft-1',
      topic: 'Software development',
      format: 'post',
      slide_count: 4,
      post_count: 2,
      scheduled_at: '2026-08-25T09:00:00.000Z',
      review_url: 'https://studio.afrisinc.com/posts/draft-1',
      action: 'review-and-approve',
    });
  });

  it('greets a nameless recipient without a blank in the sentence', () => {
    const request = buildPostReviewNotification({ userId: 'user-1' }, NOTICE);

    expect(request.data?.name).toBe('there');
  });

  it('reports an unscheduled draft as having no slot rather than inventing one', () => {
    const request = buildPostReviewNotification(RECIPIENT, { ...NOTICE, scheduledAt: null });

    expect(request.data?.scheduled_at).toBeNull();
  });
});

describe('requestPostReview', () => {
  it('looks the owner up and sends them the notice', async () => {
    const result = await requestPostReview({ ...NOTICE, userId: 'user-1' });

    expect(mocks.findById).toHaveBeenCalledWith('user-1');
    expect(mocks.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        template: POST_REVIEW_TEMPLATE,
        targets: [
          { channel: 'in_app', to: 'user-1' },
          { channel: 'email', to: 'editor@example.com' },
        ],
      })
    );
    expect(result.sent).toHaveLength(1);
  });

  it('uses the repository it is handed over the default one', async () => {
    const users = {
      findById: vi.fn(async () => ({ id: 'user-2', email: 'other@example.com', name: 'Kofi' })),
    };

    await requestPostReview({ ...NOTICE, userId: 'user-2' }, users as never);

    expect(users.findById).toHaveBeenCalledWith('user-2');
    expect(mocks.findById).not.toHaveBeenCalled();
    expect(mocks.sendNotification.mock.calls[0][0].data).toMatchObject({ name: 'Kofi' });
  });

  it('still notifies in_app when the owner record cannot be read', async () => {
    mocks.findById.mockRejectedValueOnce(new Error('users table down'));

    await requestPostReview({ ...NOTICE, userId: 'user-1' });

    expect(mocks.sendNotification.mock.calls[0][0].targets).toEqual([
      { channel: 'in_app', to: 'user-1' },
    ]);
  });

  it('hands back what the delivery reported', async () => {
    mocks.sendNotification.mockResolvedValueOnce({
      sent: [],
      failed: 0,
      skipped: 'not-configured',
    });

    await expect(requestPostReview({ ...NOTICE, userId: 'user-1' })).resolves.toMatchObject({
      skipped: 'not-configured',
    });
  });
});
