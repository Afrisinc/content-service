import { MetaPlatform } from '@/adapters/meta/meta.types';
import { metaClient } from '@/adapters/meta/metaClient';
import { env } from '@/config/env';
import {
  BACKOFF_TTL_SECONDS,
  METRICS_SUPPORTED_PLATFORMS,
  firstPullCutoff,
  horizonStart,
  isBackingOff,
  isDueForMetrics,
  nextBackoff,
  staleBefore,
  type MetricsBackoff,
} from '@/helpers/analyticsCadence.helper';
import {
  classifyMetaError,
  tallyFailure,
  type MetaFailureKind,
  type MetaFailureTally,
} from '@/helpers/metaReadFailure.helper';
import { analyticsRepository } from '@/repositories/analytics.repository';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { cacheDelete, cacheGet, cacheIncrementBy, cacheSet } from '@/utils/cache';
import { logger } from '@/utils/logger';
import { decryptToken } from '@/utils/oauthToken';

const META_PLATFORMS = METRICS_SUPPORTED_PLATFORMS;
const BUDGET_TTL_SECONDS = 3600;
const CANDIDATE_OVERSCAN = 3;

export interface PullReport {
  postsRead: number;
  postsFailed: number;
  postsDeferred: number;
  accountsFailed: number;
  snapshotsTaken: number;
  callsSpent: number;
  stoppedEarly: boolean;
  postFailures: MetaFailureTally;
  accountFailures: MetaFailureTally;
  deferredReasons: MetaFailureTally;
}

interface Sweep {
  now: Date;
  date: Date;
  budget: number;
  report: PullReport;
  brokenPages: Map<string, MetaFailureKind>;
  halted: boolean;
}

const pageKey = (platform: string, pageId: string) => `${platform}:${pageId}`;
const backoffKey = (postId: string) => `analytics:pull:backoff:${postId}`;

function startOfUtcDay(when: Date): Date {
  return new Date(Date.UTC(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate()));
}

function metaPlatform(platform: string): MetaPlatform {
  return platform === MetaPlatform.INSTAGRAM ? MetaPlatform.INSTAGRAM : MetaPlatform.FACEBOOK;
}

/**
 * Reads engagement and follower counts back from the platforms.
 *
 * Every platform call is spent against a shared hourly budget held in Redis, so
 * a sweep can never consume the quota that publishing needs. Redis being
 * unavailable degrades to the in-process count for this sweep rather than
 * blocking the read entirely.
 */
export class AnalyticsPullService {
  async run(now: Date = new Date()): Promise<PullReport> {
    const report: PullReport = {
      postsRead: 0,
      postsFailed: 0,
      postsDeferred: 0,
      accountsFailed: 0,
      snapshotsTaken: 0,
      callsSpent: 0,
      stoppedEarly: false,
      postFailures: {},
      accountFailures: {},
      deferredReasons: {},
    };

    const budget = await this.remainingBudget(now);
    if (budget <= 0) {
      logger.info({}, '[analytics-pull] Hourly call budget already spent, skipping sweep');
      report.stoppedEarly = true;
      return report;
    }

    const sweep: Sweep = {
      now,
      date: startOfUtcDay(now),
      budget,
      report,
      brokenPages: new Map(),
      halted: false,
    };

    await this.snapshotAccounts(sweep);
    if (!sweep.halted) {
      await this.refreshPosts(sweep);
    }

    logger.info({ ...report }, '[analytics-pull] Sweep finished');
    return report;
  }

  private async remainingBudget(now: Date): Promise<number> {
    const key = `analytics:pull:budget:${now.toISOString().slice(0, 13)}`;
    const spent = await cacheIncrementBy(key, 0, BUDGET_TTL_SECONDS);
    // Unknown means Redis is down, not that nothing was spent; the sweep still
    // runs but only against this process's own budget.
    return env.ANALYTICS_PULL_CALL_BUDGET - (spent ?? 0);
  }

  private async spend(now: Date, calls: number): Promise<void> {
    const key = `analytics:pull:budget:${now.toISOString().slice(0, 13)}`;
    await cacheIncrementBy(key, calls, BUDGET_TTL_SECONDS);
  }

  private overUsageCeiling(): boolean {
    const usage = metaClient.lastUsage();
    return Boolean(usage && usage.callCount >= env.ANALYTICS_PULL_USAGE_CEILING);
  }

  private outOfBudget(sweep: Sweep): boolean {
    if (sweep.report.callsSpent >= sweep.budget || this.overUsageCeiling()) {
      sweep.report.stoppedEarly = true;
      return true;
    }
    return false;
  }

  private async charge(sweep: Sweep, requests: number): Promise<void> {
    if (requests <= 0) {
      return;
    }
    sweep.report.callsSpent += requests;
    await this.spend(sweep.now, requests);
  }

  private haltOnRateLimit(sweep: Sweep, kind: MetaFailureKind): void {
    if (kind === 'rate_limit') {
      sweep.halted = true;
      sweep.report.stoppedEarly = true;
    }
  }

  private async snapshotAccounts(sweep: Sweep): Promise<void> {
    const { report } = sweep;
    const accounts = await analyticsRepository.accountsNeedingSnapshot(
      sweep.date,
      META_PLATFORMS,
      env.ANALYTICS_PULL_ACCOUNT_LIMIT
    );

    for (const account of accounts) {
      if (this.outOfBudget(sweep)) {
        return;
      }

      const token = this.tokenFor(account.accessToken);
      if (!token) {
        continue;
      }

      const result = await metaClient.readAccountMetrics(
        account.pageId,
        token,
        metaPlatform(account.platform)
      );
      await this.charge(sweep, result.requests);

      if (!result.ok) {
        const kind = classifyMetaError(result.error);
        report.accountsFailed += 1;
        tallyFailure(report.accountFailures, kind);
        if (kind === 'token' || kind === 'permission') {
          sweep.brokenPages.set(pageKey(account.platform, account.pageId), kind);
        }
        this.haltOnRateLimit(sweep, kind);
        if (sweep.halted) {
          return;
        }
        continue;
      }

      await analyticsRepository.recordAccountSnapshot(
        account.id,
        sweep.date,
        account.platform,
        result.value
      );
      report.snapshotsTaken += 1;
    }
  }

  private async refreshPosts(sweep: Sweep): Promise<void> {
    const { now, report } = sweep;
    const candidates = await analyticsRepository.postsDueForMetrics({
      platforms: META_PLATFORMS,
      publishedFrom: horizonStart(now),
      publishedBefore: firstPullCutoff(now),
      staleBefore: staleBefore(now),
      limit: env.ANALYTICS_PULL_POST_LIMIT * CANDIDATE_OVERSCAN,
    });

    let attempted = 0;
    for (const post of candidates) {
      if (attempted >= env.ANALYTICS_PULL_POST_LIMIT || this.outOfBudget(sweep)) {
        return;
      }

      if (!isDueForMetrics(post.publishedAt, post.lastMetricsUpdate, now)) {
        continue;
      }

      const backoff = await cacheGet<MetricsBackoff>(backoffKey(post.id));
      if (backoff && isBackingOff(backoff, now)) {
        report.postsDeferred += 1;
        tallyFailure(report.deferredReasons, backoff.kind);
        continue;
      }

      const brokenKind = sweep.brokenPages.get(pageKey(post.platform, post.pageId));
      if (brokenKind) {
        await this.recordPostFailure(sweep, post.id, backoff, brokenKind);
        continue;
      }

      const token = await this.tokenForPost(post);
      if (!token || !post.postId) {
        continue;
      }

      attempted += 1;
      const result = await metaClient.readPostMetrics(
        post.postId,
        token,
        metaPlatform(post.platform)
      );
      await this.charge(sweep, result.requests);

      if (!result.ok) {
        const kind = classifyMetaError(result.error);
        if (kind === 'token') {
          sweep.brokenPages.set(pageKey(post.platform, post.pageId), kind);
        }
        await this.recordPostFailure(sweep, post.id, backoff, kind);
        if (sweep.halted) {
          return;
        }
        continue;
      }

      const metrics = result.value;
      await socialMediaPostRepository.updatePostMetrics(post.id, {
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        views: metrics.views,
        reach: metrics.reach,
        impressions: metrics.impressions,
      });

      await socialMediaPostRepository.upsertAnalytics(post.id, {
        date: sweep.date,
        platform: post.platform,
        impressions: metrics.impressions,
        reaches: metrics.reach,
        engagements: metrics.engagements,
        clicks: metrics.clicks,
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        saves: metrics.saves,
        views: metrics.views,
      });

      if (backoff) {
        await cacheDelete(backoffKey(post.id));
      }

      report.postsRead += 1;
    }
  }

  private async recordPostFailure(
    sweep: Sweep,
    postId: string,
    previous: MetricsBackoff | null,
    kind: MetaFailureKind
  ): Promise<void> {
    sweep.report.postsFailed += 1;
    tallyFailure(sweep.report.postFailures, kind);
    this.haltOnRateLimit(sweep, kind);

    if (kind !== 'rate_limit') {
      await cacheSet(
        backoffKey(postId),
        nextBackoff(previous, kind, sweep.now),
        BACKOFF_TTL_SECONDS
      );
    }
  }

  private tokenFor(encrypted: string | null): string | null {
    if (!encrypted) {
      return null;
    }

    try {
      return decryptToken(encrypted);
    } catch {
      return null;
    }
  }

  /** The post's own token first; a rotated account token is the fallback. */
  private async tokenForPost(post: {
    userId: string;
    platform: string;
    pageId: string;
    accessTokenEnc: string | null;
  }): Promise<string | null> {
    const own = this.tokenFor(post.accessTokenEnc);
    if (own) {
      return own;
    }

    const account = await socialMediaPostRepository.getAccount(
      post.userId,
      post.platform,
      post.pageId
    );
    return this.tokenFor(account?.accessToken ?? null);
  }
}

export const analyticsPullService = new AnalyticsPullService();
