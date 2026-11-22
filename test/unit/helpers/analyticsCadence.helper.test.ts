import {
  firstPullCutoff,
  horizonStart,
  isBackingOff,
  isDueForMetrics,
  nextBackoff,
  retryDelayMs,
  staleBefore,
} from '@/helpers/analyticsCadence.helper';
import { describe, expect, it } from 'vitest';

const NOW = new Date('2026-08-21T12:00:00.000Z');
const HOUR = 3600000;
const DAY = 24 * HOUR;

const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe('isDueForMetrics', () => {
  it('is never due for a post that was never published', () => {
    expect(isDueForMetrics(null, null, NOW)).toBe(false);
  });

  it('waits a full day before the first read', () => {
    expect(isDueForMetrics(ago(23 * HOUR), null, NOW)).toBe(false);
    expect(isDueForMetrics(ago(25 * HOUR), null, NOW)).toBe(true);
  });

  it('stops once the post passes the tracking horizon', () => {
    expect(isDueForMetrics(ago(29 * DAY), null, NOW)).toBe(true);
    expect(isDueForMetrics(ago(31 * DAY), null, NOW)).toBe(false);
  });

  it('reads a young post daily', () => {
    const publishedAt = ago(3 * DAY);

    expect(isDueForMetrics(publishedAt, ago(19 * HOUR), NOW)).toBe(false);
    expect(isDueForMetrics(publishedAt, ago(21 * HOUR), NOW)).toBe(true);
  });

  it('drops to weekly once past the daily phase', () => {
    const publishedAt = ago(20 * DAY);

    expect(isDueForMetrics(publishedAt, ago(2 * DAY), NOW)).toBe(false);
    expect(isDueForMetrics(publishedAt, ago(7 * DAY), NOW)).toBe(true);
  });

  it('treats day fourteen as still daily', () => {
    expect(isDueForMetrics(ago(13 * DAY), ago(21 * HOUR), NOW)).toBe(true);
    expect(isDueForMetrics(ago(15 * DAY), ago(21 * HOUR), NOW)).toBe(false);
  });

  it('defaults to now when no clock is passed', () => {
    expect(isDueForMetrics(new Date(Date.now() - 2 * DAY), null)).toBe(true);
  });
});

describe('window boundaries', () => {
  it('places the horizon thirty days back', () => {
    expect(horizonStart(NOW).toISOString()).toBe('2026-07-22T12:00:00.000Z');
  });

  it('places the first-pull cutoff a day back', () => {
    expect(firstPullCutoff(NOW).toISOString()).toBe('2026-08-20T12:00:00.000Z');
  });

  it('uses the shorter interval for staleness so nothing due is filtered out', () => {
    expect(staleBefore(NOW).toISOString()).toBe('2026-08-20T16:00:00.000Z');
  });
});

describe('metrics backoff', () => {
  it('climbs 2h, 6h, 24h, 72h for transient failures, then holds', () => {
    expect([1, 2, 3, 4, 5].map(failures => retryDelayMs('unavailable', failures) / HOUR)).toEqual([
      2, 6, 24, 72, 72,
    ]);
    expect(retryDelayMs('other', 1)).toBe(2 * HOUR);
  });

  it('waits a day for problems only a reconnect can fix', () => {
    expect(retryDelayMs('token', 1)).toBe(24 * HOUR);
    expect(retryDelayMs('permission', 4)).toBe(24 * HOUR);
  });

  it('waits a week for a post that is gone and never pauses on a rate limit', () => {
    expect(retryDelayMs('missing', 1)).toBe(7 * 24 * HOUR);
    expect(retryDelayMs('rate_limit', 3)).toBe(0);
  });

  it('counts failures from the previous backoff', () => {
    expect(nextBackoff(null, 'unavailable', NOW)).toEqual({
      failures: 1,
      kind: 'unavailable',
      retryAt: '2026-08-21T14:00:00.000Z',
    });
    expect(nextBackoff({ failures: 1, kind: 'unavailable', retryAt: '' }, 'token', NOW)).toEqual({
      failures: 2,
      kind: 'token',
      retryAt: '2026-08-22T12:00:00.000Z',
    });
  });

  it('is backing off only until the retry time', () => {
    const backoff = { failures: 1, kind: 'token' as const, retryAt: '2026-08-21T13:00:00.000Z' };
    expect(isBackingOff(null, NOW)).toBe(false);
    expect(isBackingOff(backoff, NOW)).toBe(true);
    expect(isBackingOff(backoff, new Date('2026-08-21T13:00:00.000Z'))).toBe(false);
  });
});
