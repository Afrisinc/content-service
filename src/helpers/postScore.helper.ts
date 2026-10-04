import type { PublishedPostRow } from '@/repositories/analytics.repository';

export type ScoreMode = 'rate' | 'count';

export type Aggregate = 'median' | 'mean';

const RATE_COVERAGE = 0.8;

export interface Scorer {
  mode: ScoreMode;
  scoreOf: (post: PublishedPostRow) => number | null;
  describe: (value: number) => string;
  figure: (value: number) => string;
}

export interface Lead<K extends string> {
  key: K;
  value: number;
  posts: number;
  restValue: number;
  restPosts: number;
  lift: number;
}

export interface LeadOptions<K extends string> {
  keyOf: (post: PublishedPostRow) => K | null;
  valueOf: (post: PublishedPostRow) => number | null;
  minPerGroup: number;
  minTotal: number;
  minLift: number;
  aggregate?: Aggregate;
}

export function engagementOf(post: PublishedPostRow): number {
  return post.likes + post.comments + post.shares + (post.saves ?? 0);
}

export function intentOf(post: PublishedPostRow): number {
  return (post.saves ?? 0) + (post.clicks ?? 0) + (post.profileVisits ?? 0);
}

export function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function mean(values: number[]): number {
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : 0;
}

export function aggregate(values: number[], how: Aggregate = 'median'): number {
  return how === 'mean' ? mean(values) : median(values);
}

export function scoreMode(posts: PublishedPostRow[]): ScoreMode {
  if (!posts.length) {
    return 'count';
  }
  const withReach = posts.filter(post => post.reach > 0).length;
  return withReach / posts.length >= RATE_COVERAGE ? 'rate' : 'count';
}

export function perReach(
  posts: PublishedPostRow[],
  measure: (post: PublishedPostRow) => number
): (post: PublishedPostRow) => number | null {
  return scoreMode(posts) === 'rate'
    ? post => (post.reach > 0 ? measure(post) / post.reach : null)
    : measure;
}

export function scorerFor(posts: PublishedPostRow[]): Scorer {
  const mode = scoreMode(posts);
  return {
    mode,
    scoreOf: perReach(posts, engagementOf),
    describe: value =>
      mode === 'rate'
        ? `${(value * 100).toFixed(1)}% engagement rate`
        : `${Math.round(value)} engagements per post`,
    figure: value => (mode === 'rate' ? `${(value * 100).toFixed(1)}%` : `${Math.round(value)}`),
  };
}

export function scoredValues(
  posts: PublishedPostRow[],
  valueOf: (post: PublishedPostRow) => number | null
): number[] {
  return posts.map(valueOf).filter((value): value is number => value !== null);
}

export function leadBy<K extends string>(
  posts: PublishedPostRow[],
  options: LeadOptions<K>
): Lead<K> | null {
  const groups = new Map<K, number[]>();
  const keyed: { key: K; value: number }[] = [];

  for (const post of posts) {
    const key = options.keyOf(post);
    const value = options.valueOf(post);
    if (key === null || value === null) {
      continue;
    }
    keyed.push({ key, value });
    groups.set(key, [...(groups.get(key) ?? []), value]);
  }
  if (keyed.length < options.minTotal) {
    return null;
  }

  let best: { key: K; value: number; posts: number } | null = null;
  for (const [key, values] of groups) {
    if (values.length < options.minPerGroup) {
      continue;
    }
    const value = aggregate(values, options.aggregate);
    if (!best || value > best.value) {
      best = { key, value, posts: values.length };
    }
  }
  if (!best) {
    return null;
  }

  const leader = best.key;
  const rest = keyed.filter(entry => entry.key !== leader).map(entry => entry.value);
  const restValue = aggregate(rest, options.aggregate);
  if (rest.length < options.minPerGroup || restValue <= 0) {
    return null;
  }

  const lift = best.value / restValue - 1;
  return lift < options.minLift ? null : { ...best, restValue, restPosts: rest.length, lift };
}
