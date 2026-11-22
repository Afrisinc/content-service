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
  sources: 4,
  fetched: 118,
  created: 9,
  duplicates: 109,
  stale: 0,
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
  articles: [] as {
    articleId: string;
    headline: string;
    outcome: 'published' | 'rejected' | 'failed';
    score: number | null;
    reason: string | null;
    social: {
      userId: string;
      groupName: string | null;
      status: 'drafted' | 'skipped' | 'failed';
      reason: string | null;
    }[];
  }[],
  recovered: 0,
  ...overrides,
});

describe('ingestionOutcome for items that were too old', () => {
  it('says how many were left out for their age', () => {
    expect(ingestionOutcome(ingestion({ fetched: 12, created: 3, stale: 5 })).detail).toBe(
      '12 items read · 3 new · 5 too old'
    );
  });
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

const failedArticle = (id: string, reason: string) => ({
  articleId: id,
  headline: `Headline ${id}`,
  outcome: 'failed' as const,
  score: null,
  reason,
  social: [],
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
      steps: [],
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
      steps: [],
    });
  });

  it('fails a batch that published nothing while some articles failed, and says why', () => {
    expect(
      enhancementOutcome(
        enhancement({
          claimed: 5,
          published: 0,
          rejected: 2,
          failed: 3,
          articles: [
            failedArticle('1', 'the rewritten article is too short (90 words)'),
            failedArticle('2', 'timeout'),
            failedArticle('3', 'timeout'),
          ],
        })
      )
    ).toEqual({
      status: 'failed',
      detail: '0 published · 2 rejected · 3 failed',
      errorMessage:
        '3 articles failed and none were published: ' +
        'the rewritten article is too short (90 words); timeout',
      steps: [
        {
          key: 'article-1',
          label: 'Headline 1',
          status: 'failed',
          errorMessage: 'Failed — the rewritten article is too short (90 words)',
        },
        {
          key: 'article-2',
          label: 'Headline 2',
          status: 'failed',
          errorMessage: 'Failed — timeout',
        },
        {
          key: 'article-3',
          label: 'Headline 3',
          status: 'failed',
          errorMessage: 'Failed — timeout',
        },
      ],
    });
  });

  it('records one step per article with the verdict and the reason', () => {
    const outcome = enhancementOutcome(
      enhancement({
        claimed: 3,
        published: 1,
        rejected: 1,
        failed: 1,
        articles: [
          {
            articleId: '1',
            headline: 'Kenya opens M-Pesa API',
            outcome: 'published',
            score: 0.86,
            reason: null,
            social: [{ userId: 'u1', groupName: 'AFRISINC', status: 'drafted', reason: null }],
          },
          {
            articleId: '2',
            headline: 'Celebrity wedding',
            outcome: 'rejected',
            score: 0.21,
            reason: 'no African business angle',
            social: [],
          },
          failedArticle('3', 'timeout'),
        ],
      })
    );

    expect(outcome.steps).toEqual([
      {
        key: 'article-1',
        label: 'Kenya opens M-Pesa API',
        status: 'succeeded',
        detail: 'Published · score 0.86 · 1 social post drafted',
      },
      {
        key: 'article-2',
        label: 'Celebrity wedding',
        status: 'skipped',
        detail: 'Rejected · score 0.21 — no African business angle',
      },
      { key: 'article-3', label: 'Headline 3', status: 'failed', errorMessage: 'Failed — timeout' },
    ]);
  });

  describe('what became of the social posts', () => {
    const publishedWith = (social: unknown[]) =>
      enhancementOutcome(
        enhancement({
          claimed: 1,
          published: 1,
          rejected: 0,
          failed: 0,
          articles: [
            {
              articleId: '1',
              headline: 'Story',
              outcome: 'published',
              score: 0.9,
              reason: null,
              social,
            },
          ],
        })
      ).steps?.[0].detail;

    const outcome = (status: string, reason: string | null = null, userId = 'u1') => ({
      userId,
      groupName: 'AFRISINC',
      status,
      reason,
    });

    it('counts the posts drafted', () => {
      expect(publishedWith([outcome('drafted'), outcome('drafted', null, 'u2')])).toBe(
        'Published · score 0.90 · 2 social posts drafted'
      );
    });

    it('says why a user was skipped, once per reason', () => {
      expect(
        publishedWith([
          outcome('skipped', 'no default brand is set'),
          outcome('skipped', 'no default brand is set', 'u2'),
        ])
      ).toBe('Published · score 0.90 · social skipped: no default brand is set');
    });

    it('says why a post failed without failing the article', () => {
      expect(publishedWith([outcome('drafted'), outcome('failed', 'render timed out', 'u2')])).toBe(
        'Published · score 0.90 · 1 social post drafted · social post failed: render timed out'
      );
    });

    it('says so when nobody was set up to receive a post', () => {
      expect(publishedWith([])).toBe(
        'Published · score 0.90 · no social post (no user has the news agent on under autopilot)'
      );
    });
  });

  it('shortens a very long headline to fit a step label', () => {
    const outcome = enhancementOutcome(
      enhancement({
        claimed: 1,
        published: 1,
        rejected: 0,
        failed: 0,
        articles: [
          {
            articleId: '1',
            headline: 'H'.repeat(120),
            outcome: 'published',
            score: 0.9,
            reason: null,
            social: [],
          },
        ],
      })
    );

    expect(outcome.steps?.[0].label).toHaveLength(60);
    expect(outcome.steps?.[0].label.endsWith('…')).toBe(true);
  });

  it('stays succeeded when some articles published despite a failure', () => {
    expect(
      enhancementOutcome(enhancement({ claimed: 4, published: 2, rejected: 1, failed: 1 }))
    ).toMatchObject({ status: 'succeeded' });
  });

  it('stays succeeded when articles were only rejected', () => {
    expect(
      enhancementOutcome(enhancement({ claimed: 3, published: 0, rejected: 3, failed: 0 }))
    ).toMatchObject({ status: 'succeeded' });
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
