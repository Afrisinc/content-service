import { describe, expect, it } from 'vitest';
import {
  analyticsOutcome,
  digestOutcome,
  enhancementOutcome,
  ingestionOutcome,
} from '@/helpers/agentRunOutcome.helper';

const ingestion = (overrides = {}) => ({
  startedAt: '',
  finishedAt: '',
  sources: 13,
  fetched: 118,
  created: 9,
  duplicates: 109,
  failedSources: [] as { name: string; error: string }[],
  ...overrides,
});

const enhancement = (overrides = {}) => ({
  startedAt: '',
  finishedAt: '',
  claimed: 5,
  published: 3,
  rejected: 1,
  failed: 1,
  recovered: 0,
  ...overrides,
});

describe('ingestionOutcome', () => {
  it('summarises a normal fetch', () => {
    expect(ingestionOutcome(ingestion())).toEqual({
      status: 'succeeded',
      detail: '118 items read · 9 new',
    });
  });

  it('mentions failed feeds but still succeeds while others worked', () => {
    const outcome = ingestionOutcome(
      ingestion({ failedSources: [{ name: 'Ventureburn', error: 'timeout' }] })
    );
    expect(outcome).toEqual({
      status: 'succeeded',
      detail: '118 items read · 9 new · 1 feed failed',
    });
  });

  it('fails when every feed failed', () => {
    const failedSources = [
      { name: 'A', error: 'x' },
      { name: 'B', error: 'y' },
    ];
    expect(
      ingestionOutcome(ingestion({ sources: 2, fetched: 0, created: 0, failedSources }))
    ).toEqual({
      status: 'failed',
      detail: '0 items read · 0 new · 2 feeds failed',
      errorMessage: 'Every feed failed: A, B',
    });
  });
});

describe('enhancementOutcome', () => {
  it('drops a tick that found nothing to do', () => {
    expect(
      enhancementOutcome(enhancement({ claimed: 0, published: 0, rejected: 0, failed: 0 }))
    ).toMatchObject({
      keep: false,
    });
  });

  it('summarises a batch', () => {
    expect(enhancementOutcome(enhancement())).toEqual({
      status: 'succeeded',
      detail: '3 published · 1 rejected · 1 failed',
    });
  });

  it('keeps a tick that only recovered interrupted articles', () => {
    expect(
      enhancementOutcome(
        enhancement({ claimed: 0, published: 0, rejected: 0, failed: 0, recovered: 2 })
      )
    ).toEqual({
      status: 'succeeded',
      detail: '0 published · 0 rejected · 0 failed · 2 interrupted recovered',
    });
  });

  it('fails when every claimed article failed', () => {
    expect(
      enhancementOutcome(enhancement({ claimed: 2, published: 0, rejected: 0, failed: 2 }))
    ).toMatchObject({
      status: 'failed',
      errorMessage: 'All 2 articles failed to publish',
    });
  });
});

describe('digestOutcome', () => {
  it('describes a sent digest', () => {
    expect(
      digestOutcome({ status: 'sent', subject: 'Afrisinc Weekly', articleIds: ['a', 'b'] })
    ).toEqual({ status: 'succeeded', detail: 'Sent "Afrisinc Weekly" with 2 articles' });
  });

  it('describes a dry run', () => {
    expect(digestOutcome({ status: 'dry-run', subject: 'S', articleIds: ['a'] }).detail).toBe(
      'Drafted "S" with 1 article, not sent'
    );
  });

  it('explains a skipped digest', () => {
    expect(digestOutcome({ status: 'skipped', reason: 'not-enough-articles' })).toEqual({
      status: 'skipped',
      detail: 'Not enough new articles for a digest',
    });
    expect(digestOutcome({ status: 'skipped', reason: 'quiet week' }).detail).toBe('quiet week');
    expect(digestOutcome({ status: 'skipped' }).detail).toBe('Skipped');
  });

  it('handles a sent digest without article ids', () => {
    expect(digestOutcome({ status: 'sent', subject: 'S' }).detail).toBe('Sent "S" with 0 articles');
  });
});

describe('analyticsOutcome', () => {
  const report = (overrides = {}) => ({
    postsRead: 40,
    postsFailed: 0,
    postsDeferred: 0,
    accountsFailed: 0,
    snapshotsTaken: 0,
    callsSpent: 12,
    stoppedEarly: false,
    postFailures: {},
    accountFailures: {},
    deferredReasons: {},
    ...overrides,
  });

  it('summarises a sync', () => {
    expect(analyticsOutcome(report())).toEqual({ status: 'succeeded', detail: '40 posts synced' });
  });

  it('mentions failures, snapshots and an early stop', () => {
    expect(
      analyticsOutcome(report({ postsFailed: 2, snapshotsTaken: 3, stoppedEarly: true })).detail
    ).toBe('40 posts synced · 2 failed · 3 snapshots · stopped at the API budget');
  });

  it('fails when nothing could be read, and says why and what to do', () => {
    expect(
      analyticsOutcome(report({ postsRead: 0, postsFailed: 20, postFailures: { token: 20 } }))
    ).toEqual({
      status: 'failed',
      detail:
        '0 posts synced · 20 failed · Page token expired or revoked (20 posts), ' +
        'reconnect the page on Brands',
      errorMessage:
        'Could not read any of 20 posts: Page token expired or revoked (20 posts), ' +
        'reconnect the page on Brands',
    });
  });

  it('groups post and account failures by reason', () => {
    expect(
      analyticsOutcome(
        report({
          postsFailed: 3,
          accountsFailed: 1,
          postFailures: { missing: 2, token: 1 },
          accountFailures: { token: 1 },
        })
      ).detail
    ).toBe(
      '40 posts synced · 3 failed · 1 account failed · ' +
        'Page token expired or revoked (1 post, 1 account), reconnect the page on Brands; ' +
        'Post no longer on the platform (2 posts)'
    );
  });

  it('fails when only accounts were tried and none could be read', () => {
    expect(
      analyticsOutcome(
        report({ postsRead: 0, accountsFailed: 2, accountFailures: { permission: 2 } })
      )
    ).toMatchObject({
      status: 'failed',
      errorMessage:
        'Could not read 2 accounts: Meta permission missing (2 accounts), ' +
        'reconnect the page on Brands and allow insights',
    });
  });

  it('names a rate limit instead of the budget', () => {
    expect(
      analyticsOutcome(
        report({ postsFailed: 1, stoppedEarly: true, postFailures: { rate_limit: 1 } })
      ).detail
    ).toBe('40 posts synced · 1 failed · Meta rate limit reached (1 post), retrying next hour');
  });

  it('skips with the remembered reason when every due post is paused', () => {
    expect(
      analyticsOutcome(report({ postsRead: 0, postsDeferred: 20, deferredReasons: { token: 20 } }))
    ).toEqual({
      status: 'skipped',
      detail:
        '20 posts paused after earlier failures: Page token expired or revoked (20 posts), ' +
        'reconnect the page on Brands',
    });
  });

  it('mentions paused posts alongside a normal sync', () => {
    expect(
      analyticsOutcome(report({ postsDeferred: 2, deferredReasons: { missing: 2 } })).detail
    ).toBe('40 posts synced · 2 paused');
  });
});
