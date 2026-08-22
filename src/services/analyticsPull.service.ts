import { MetaPlatform } from '@/adapters/meta/meta.types';
import { metaClient } from '@/adapters/meta/metaClient';
import { env } from '@/config/env';
import {
  METRICS_SUPPORTED_PLATFORMS,
  firstPullCutoff,
  horizonStart,
  isDueForMetrics,
  staleBefore,
} from '@/helpers/analyticsCadence.helper';
import { analyticsRepository } from '@/repositories/analytics.repository';
import { socialMediaPostRepository } from '@/repositories/socialMediaPost.repository';
import { cacheIncrementBy } from '@/utils/cache';
import { logger } from '@/utils/logger';
import { decryptToken } from '@/utils/oauthToken';

const META_PLATFORMS = METRICS_SUPPORTED_PLATFORMS;
const BUDGET_TTL_SECONDS = 3600;

export interface PullReport {
  postsRead: number;
  postsFailed: number;
  snapshotsTaken: number;
  callsSpent: number;
  stoppedEarly: boolean;
}

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
      snapshotsTaken: 0,
      callsSpent: 0,
      stoppedEarly: false,
    };

    const budget = await this.remainingBudget(now);
    if (budget <= 0) {
      logger.info({}, '[analytics-pull] Hourly call budget already spent, skipping sweep');
      report.stoppedEarly = true;
      return report;
    }

    await this.snapshotAccounts(now, report, budget);
    await this.refreshPosts(now, report, budget);

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

  private async snapshotAccounts(now: Date, report: PullReport, budget: number): Promise<void> {
    const date = startOfUtcDay(now);
    const accounts = await analyticsRepository.accountsNeedingSnapshot(
      date,
      META_PLATFORMS,
      env.ANALYTICS_PULL_ACCOUNT_LIMIT
    );

    for (const account of accounts) {
      if (report.callsSpent >= budget || this.overUsageCeiling()) {
        report.stoppedEarly = true;
        return;
      }

      const token = this.tokenFor(account.accessToken);
      if (!token) {
        continue;
      }

      report.callsSpent += 1;
      await this.spend(now, 1);

      const metrics = await metaClient.getAccountMetrics(
        account.pageId,
        token,
        metaPlatform(account.platform)
      );

      if (!metrics) {
        continue;
      }

      await analyticsRepository.recordAccountSnapshot(account.id, date, account.platform, metrics);
      report.snapshotsTaken += 1;
    }
  }

  private async refreshPosts(now: Date, report: PullReport, budget: number): Promise<void> {
    const candidates = await analyticsRepository.postsDueForMetrics({
      platforms: META_PLATFORMS,
      publishedFrom: horizonStart(now),
      publishedBefore: firstPullCutoff(now),
      staleBefore: staleBefore(now),
      limit: env.ANALYTICS_PULL_POST_LIMIT,
    });

    const date = startOfUtcDay(now);

    for (const post of candidates) {
      if (report.callsSpent >= budget || this.overUsageCeiling()) {
        report.stoppedEarly = true;
        return;
      }

      if (!isDueForMetrics(post.publishedAt, post.lastMetricsUpdate, now)) {
        continue;
      }

      const token = await this.tokenForPost(post);
      if (!token || !post.postId) {
        continue;
      }

      report.callsSpent += 1;
      await this.spend(now, 1);

      const metrics = await metaClient.getPostMetrics(
        post.postId,
        token,
        metaPlatform(post.platform)
      );

      if (!metrics) {
        report.postsFailed += 1;
        continue;
      }

      await socialMediaPostRepository.updatePostMetrics(post.id, {
        likes: metrics.likes,
        comments: metrics.comments,
        shares: metrics.shares,
        views: metrics.views,
        reach: metrics.reach,
        impressions: metrics.impressions,
      });

      await socialMediaPostRepository.upsertAnalytics(post.id, {
        date,
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

      report.postsRead += 1;
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
