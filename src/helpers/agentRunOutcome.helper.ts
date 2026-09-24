import { AgentRunStatus } from '@prisma/client';
import { pluralise } from '@/helpers/agentRun.helper';
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

export function analyticsOutcome(report: PullReport): RunOutcome {
  const detail = [
    `${pluralise(report.postsRead, 'post')} synced`,
    ...(report.postsFailed > 0 ? [`${report.postsFailed} failed`] : []),
    ...(report.snapshotsTaken > 0 ? [`${pluralise(report.snapshotsTaken, 'snapshot')}`] : []),
    ...(report.stoppedEarly ? ['stopped at the API budget'] : []),
  ].join(' · ');

  if (report.postsRead === 0 && report.postsFailed > 0) {
    return {
      status: AgentRunStatus.failed,
      detail,
      errorMessage: `Could not read any of ${pluralise(report.postsFailed, 'post')}`,
    };
  }

  return { status: AgentRunStatus.succeeded, detail };
}
