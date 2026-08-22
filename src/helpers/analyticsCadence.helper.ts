/** Platforms the pull job has an adapter for. Others publish but do not report back yet. */
export const METRICS_SUPPORTED_PLATFORMS = ['facebook', 'instagram'];

const HOUR_MS = 3600000;
const DAY_MS = 24 * HOUR_MS;

export const FIRST_PULL_AFTER_MS = 24 * HOUR_MS;
export const DAILY_PHASE_DAYS = 14;
export const TRACKING_HORIZON_DAYS = 30;

const DAILY_INTERVAL_MS = 20 * HOUR_MS;
const WEEKLY_INTERVAL_MS = 6 * DAY_MS;

/**
 * A post earns most of its engagement in the first fortnight, so it is polled
 * daily until day 14, weekly until day 30, then left alone. Polling every post
 * every day would spend the app's hourly quota on rows that no longer move.
 */
export function isDueForMetrics(
  publishedAt: Date | null,
  lastMetricsUpdate: Date | null,
  now: Date = new Date()
): boolean {
  if (!publishedAt) {
    return false;
  }

  const age = now.getTime() - publishedAt.getTime();
  if (age < FIRST_PULL_AFTER_MS || age > TRACKING_HORIZON_DAYS * DAY_MS) {
    return false;
  }

  if (!lastMetricsUpdate) {
    return true;
  }

  const sinceLast = now.getTime() - lastMetricsUpdate.getTime();
  const interval = age <= DAILY_PHASE_DAYS * DAY_MS ? DAILY_INTERVAL_MS : WEEKLY_INTERVAL_MS;

  return sinceLast >= interval;
}

/** The oldest publish date still inside the tracking horizon. */
export function horizonStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - TRACKING_HORIZON_DAYS * DAY_MS);
}

/** The newest publish date old enough for a first pull. */
export function firstPullCutoff(now: Date = new Date()): Date {
  return new Date(now.getTime() - FIRST_PULL_AFTER_MS);
}

/**
 * Rows last touched before this are candidates. It uses the shorter of the two
 * intervals so the query never filters out something the cadence would take.
 */
export function staleBefore(now: Date = new Date()): Date {
  return new Date(now.getTime() - DAILY_INTERVAL_MS);
}
