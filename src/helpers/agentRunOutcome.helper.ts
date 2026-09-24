import { AgentRunStatus } from '@prisma/client';
import { pluralise } from '@/helpers/agentRun.helper';
import {
  META_FAILURE_COPY,
  META_FAILURE_KINDS,
  type MetaFailureTally,
} from '@/helpers/metaReadFailure.helper';
import type { RunOutcome } from '@/services/agentRunRecorder.service';
import type { PullReport } from '@/services/analyticsPull.service';
import type { EnhancementResult } from '@/services/newsEnhancement.service';
import type { IngestionResult } from '@/services/newsIngestion.service';
import type { DigestRunResult } from '@/services/newsletterDigest.service';

export function ingestionOutcome(result: IngestionResult): RunOutcome {
  const failed = result.failedSources;
  const detail = [
    `${pluralise(result.fetched, 'item')} read`,
    `${result.created} new`,
    ...(failed.length > 0 ? [`${pluralise(failed.length, 'feed')} failed`] : []),
  ].join(' · ');

  if (result.sources > 0 && failed.length === result.sources) {
    return {
      status: AgentRunStatus.failed,
      detail,
      errorMessage: `Every feed failed: ${failed.map(source => source.name).join(', ')}`,
    };
  }

  return { status: AgentRunStatus.succeeded, detail };
}

export function enhancementOutcome(result: EnhancementResult): RunOutcome {
  if (result.claimed === 0 && result.recovered === 0) {
    return { status: AgentRunStatus.skipped, detail: 'Nothing was waiting', keep: false };
  }

  const detail = [
    `${result.published} published`,
    `${result.rejected} rejected`,
    `${result.failed} failed`,
    ...(result.recovered > 0 ? [`${result.recovered} interrupted recovered`] : []),
  ].join(' · ');

  if (result.claimed > 0 && result.failed === result.claimed) {
    return {
      status: AgentRunStatus.failed,
      detail,
      errorMessage: `All ${pluralise(result.claimed, 'article')} failed to publish`,
    };
  }

  return { status: AgentRunStatus.succeeded, detail };
}

export function digestOutcome(result: DigestRunResult): RunOutcome {
  if (result.status === 'skipped') {
    return {
      status: AgentRunStatus.skipped,
      detail:
        result.reason === 'not-enough-articles'
          ? 'Not enough new articles for a digest'
          : (result.reason ?? 'Skipped'),
    };
  }

  const articles = pluralise(result.articleIds?.length ?? 0, 'article');
  return {
    status: AgentRunStatus.succeeded,
    detail:
      result.status === 'dry-run'
        ? `Drafted "${result.subject}" with ${articles}, not sent`
        : `Sent "${result.subject}" with ${articles}`,
  };
}

function describeFailures(posts: MetaFailureTally, accounts: MetaFailureTally = {}): string {
  return META_FAILURE_KINDS.flatMap(kind => {
    const postCount = posts[kind] ?? 0;
    const accountCount = accounts[kind] ?? 0;
    if (postCount === 0 && accountCount === 0) {
      return [];
    }
    const affected = [
      ...(postCount > 0 ? [pluralise(postCount, 'post')] : []),
      ...(accountCount > 0 ? [pluralise(accountCount, 'account')] : []),
    ].join(', ');
    const { label, action } = META_FAILURE_COPY[kind];
    return [`${label} (${affected})${action ? `, ${action}` : ''}`];
  }).join('; ');
}

export function analyticsOutcome(report: PullReport): RunOutcome {
  const reasons = describeFailures(report.postFailures, report.accountFailures);
  const rateLimited =
    (report.postFailures.rate_limit ?? 0) + (report.accountFailures.rate_limit ?? 0) > 0;

  if (
    report.postsRead === 0 &&
    report.postsFailed === 0 &&
    report.accountsFailed === 0 &&
    report.snapshotsTaken === 0 &&
    report.postsDeferred > 0
  ) {
    const paused = pluralise(report.postsDeferred, 'post');
    const reasonsPaused = describeFailures(report.deferredReasons);
    return {
      status: AgentRunStatus.skipped,
      detail: `${paused} paused after earlier failures: ${reasonsPaused}`,
    };
  }

  const detail = [
    `${pluralise(report.postsRead, 'post')} synced`,
    ...(report.postsFailed > 0 ? [`${report.postsFailed} failed`] : []),
    ...(report.accountsFailed > 0 ? [`${pluralise(report.accountsFailed, 'account')} failed`] : []),
    ...(report.snapshotsTaken > 0 ? [`${pluralise(report.snapshotsTaken, 'snapshot')}`] : []),
    ...(report.postsDeferred > 0 ? [`${report.postsDeferred} paused`] : []),
    ...(report.stoppedEarly && !rateLimited ? ['stopped at the API budget'] : []),
    ...(reasons ? [reasons] : []),
  ].join(' · ');

  if (report.postsRead === 0 && report.postsFailed > 0) {
    return {
      status: AgentRunStatus.failed,
      detail,
      errorMessage: `Could not read any of ${pluralise(report.postsFailed, 'post')}: ${reasons}`,
    };
  }

  if (report.postsRead === 0 && report.snapshotsTaken === 0 && report.accountsFailed > 0) {
    return {
      status: AgentRunStatus.failed,
      detail,
      errorMessage: `Could not read ${pluralise(report.accountsFailed, 'account')}: ${reasons}`,
    };
  }

  return { status: AgentRunStatus.succeeded, detail };
}
