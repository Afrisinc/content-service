import {
  AccountGroupRepository,
  accountGroupRepository,
  type AccountGroupWithMembers,
} from '@/repositories/accountGroup.repository';
import { AgentRunRepository, agentRunRepository } from '@/repositories/agentRun.repository';
import {
  AutomationPolicyRepository,
  automationPolicyRepository,
} from '@/repositories/automationPolicy.repository';
import { cancelRun, isRunCancellable } from '@/helpers/runCancellation.helper';
import { AgentRunTracker, agentRunTracker } from '@/services/agentRunTracker.service';
import { PostAgentService, postAgentService } from '@/services/postAgent.service';
import {
  AgentRunDTO,
  AgentRunStepDTO,
  AutomationPolicyDTO,
  UpdateAutomationPolicyPayload,
} from '@/types/accountGroup.types';
import { pluralise } from '@/helpers/agentRun.helper';
import { PostFormatName } from '@/types/post.types';
import { env } from '@/config/env';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { AgentRunStatus, AgentStepStatus, AutomationMode, PostDraftStatus } from '@prisma/client';

export const POST_AGENT_NAME = 'post-agent';
export const AUTOPILOT_ACTOR = 'autopilot';
export const AUTOPILOT_TRIGGER = 'autopilot';
export const MANUAL_TRIGGER = 'manual';

const POST_FORMATS: ReadonlyArray<PostFormatName> = ['post', 'story', 'single'];

const DEFAULT_MAX_POSTS_PER_DAY = 3;

export interface AutopilotGroupOutcome {
  groupId: string;
  groupName: string;
  drafted: number;
  skipped: string | null;
  failed: string | null;
}

export interface RunRequestOutcome {
  accepted: boolean;
  alreadyRunning: boolean;
  activeRunId: string | null;
  reason: string | null;
}

export interface AutopilotRunSummary {
  userId: string;
  mode: AutomationMode;
  drafted: number;
  groups: AutopilotGroupOutcome[];
}

function startOfToday(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function asPostFormat(value: string): PostFormatName {
  return POST_FORMATS.includes(value as PostFormatName) ? (value as PostFormatName) : 'post';
}

export class AutomationService {
  constructor(
    private readonly policies: AutomationPolicyRepository = automationPolicyRepository,
    private readonly groups: AccountGroupRepository = accountGroupRepository,
    private readonly runs: AgentRunRepository = agentRunRepository,
    private readonly postAgent: PostAgentService = postAgentService,
    private readonly tracker: AgentRunTracker = agentRunTracker
  ) {}

  async getPolicy(userId: string): Promise<AutomationPolicyDTO> {
    const policy = await this.policies.findByUser(userId);
    return this.toPolicyDTO(userId, policy);
  }

  async updatePolicy(
    userId: string,
    payload: UpdateAutomationPolicyPayload
  ): Promise<AutomationPolicyDTO> {
    if (payload.defaultGroupId) {
      const group = await this.groups.findByIdForUser(payload.defaultGroupId, userId);
      if (!group) {
        throw new NotFoundError('the group named as default does not exist');
      }
    }

    const pausedUntil =
      payload.pausedUntil === undefined
        ? undefined
        : payload.pausedUntil === null
          ? null
          : new Date(payload.pausedUntil);

    if (pausedUntil instanceof Date && Number.isNaN(pausedUntil.getTime())) {
      throw new BadRequestError('pausedUntil must be a valid timestamp');
    }

    const policy = await this.policies.upsert(userId, {
      ...(payload.mode !== undefined ? { mode: payload.mode } : {}),
      ...(payload.autoPublish !== undefined ? { autoPublish: payload.autoPublish } : {}),
      ...(payload.defaultGroupId !== undefined ? { defaultGroupId: payload.defaultGroupId } : {}),
      ...(payload.maxPostsPerDay !== undefined ? { maxPostsPerDay: payload.maxPostsPerDay } : {}),
      ...(pausedUntil !== undefined ? { pausedUntil } : {}),
    });

    logger.info({ userId, mode: policy.mode }, 'Automation policy updated');
    return this.toPolicyDTO(userId, policy);
  }

  async listRuns(params: {
    userId: string;
    groupId?: string;
    status?: AgentRunStatus;
    page?: number;
    limit?: number;
  }) {
    const result = await this.runs.list(params);
    const items = await Promise.all(
      result.items.map(run => this.withResumable(this.withCancellable(this.toRunDTO(run))))
    );
    return { ...result, items };
  }

  async summarise(userId: string, since: Date = startOfToday()) {
    return this.runs.summariseForUser(userId, since);
  }

  /**
   * Accept a hand-triggered pass and get out of the way. Drafting calls an LLM
   * and a render service, so it takes minutes — far longer than a request should
   * be held open. The work runs detached and reports through the run log, which
   * is what the dashboard polls, so closing the page does not stop it.
   */
  async requestRun(userId: string): Promise<RunRequestOutcome> {
    const active = await this.runs.findActiveForUser(userId);
    if (active) {
      return {
        accepted: false,
        alreadyRunning: true,
        activeRunId: active.id,
        reason: 'a run is already going',
      };
    }

    const groups = await this.groups.findAutopilotGroups([userId]);
    if (!groups.length) {
      return {
        accepted: false,
        alreadyRunning: false,
        activeRunId: null,
        reason: 'no brand has its agents switched on',
      };
    }

    // Checked here, not only inside the pass. Without this the pass is accepted,
    // skips every brand on the budget, creates no run at all — and the caller is
    // told the agents are running when nothing is.
    const policy = await this.policies.findByUser(userId);
    const cap = policy?.maxPostsPerDay ?? DEFAULT_MAX_POSTS_PER_DAY;
    const usedToday = await this.runs.countSince(userId, startOfToday());
    if (usedToday >= cap) {
      return {
        accepted: false,
        alreadyRunning: false,
        activeRunId: null,
        reason:
          `today's limit of ${pluralise(cap, 'post')} is already used — ` +
          'raise the cap, or wait until tomorrow',
      };
    }

    // Deliberately not awaited. Failures are recorded on the run rows, and the
    // catch here is only so an unhandled rejection cannot take the process down.
    void this.runForUser(userId, MANUAL_TRIGGER).catch(err => {
      logger.error(
        { userId, error: err instanceof Error ? err.message : String(err) },
        'Detached agent run failed'
      );
    });

    return { accepted: true, alreadyRunning: false, activeRunId: null, reason: null };
  }

  /**
   * Pick a failed run back up from the stage that broke. Stages that already
   * succeeded keep their result — the copy agent is not paid for twice — so this
   * is a continuation of the same run, not a second attempt at it.
   */
  async requestResume(userId: string, runId: string): Promise<RunRequestOutcome> {
    const run = await this.runs.findById(runId);
    if (!run || run.userId !== userId) {
      throw new NotFoundError('agent run not found');
    }

    if (run.status === AgentRunStatus.running) {
      return {
        accepted: false,
        alreadyRunning: true,
        activeRunId: run.id,
        reason: 'this run is already going',
      };
    }

    if (run.status !== AgentRunStatus.failed) {
      throw new ConflictError('only a failed run can be resumed');
    }

    const active = await this.runs.findActiveForUser(userId);
    if (active) {
      return {
        accepted: false,
        alreadyRunning: true,
        activeRunId: active.id,
        reason: 'another run is already going',
      };
    }

    if (!(await this.postAgent.isResumable(runId))) {
      throw new ConflictError(
        'the working state for this run has expired — brief it again rather than resuming'
      );
    }

    await this.runs.reopenRun(runId);

    // Detached for the same reason a fresh pass is: this takes minutes, and the
    // run log is where it reports.
    void this.postAgent.resume(runId).catch(async err => {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ userId, runId, error: message }, 'Resumed agent run failed');
      // Through the tracker, so stages that never got their turn are abandoned
      // rather than left spinning in the timeline.
      await this.tracker.finish(runId, {
        status: AgentRunStatus.failed,
        errorMessage: message,
      });
    });

    return { accepted: true, alreadyRunning: false, activeRunId: runId, reason: null };
  }

  /**
   * Stop a run that is still going. A pass holds the workspace's one run slot,
   * so a stalled model call would otherwise block everything until the stale-run
   * sweep catches it — this frees the slot immediately.
   */
  async cancel(userId: string, runId: string): Promise<{ cancelled: boolean; reason: string }> {
    const run = await this.runs.findById(runId);
    if (!run || run.userId !== userId) {
      throw new NotFoundError('agent run not found');
    }

    if (run.status !== AgentRunStatus.running) {
      throw new ConflictError('that run is not going');
    }

    // The work runs in whichever instance accepted it. Saying so beats pretending.
    const stopped = cancelRun(runId);

    await this.tracker.finish(runId, {
      status: AgentRunStatus.failed,
      errorMessage: stopped
        ? 'stopped by hand'
        : 'stopped by hand — the pass was running elsewhere and may continue there',
    });

    logger.info({ userId, runId, stopped }, 'Agent run cancelled');
    return {
      cancelled: stopped,
      reason: stopped ? 'stopped' : 'marked stopped, but the pass is running in another instance',
    };
  }

  /**
   * Close out runs whose process died mid-flight. Without this the dashboard
   * shows a stage spinning for ever on work that stopped hours ago.
   */
  async reconcileInterruptedRuns(
    maxRunMinutes: number = env.AUTOPILOT_MAX_RUN_MINUTES
  ): Promise<number> {
    const cutoff = new Date(Date.now() - maxRunMinutes * 60_000);
    const stale = await this.runs.findStale(cutoff);

    if (!stale.length) {
      return 0;
    }

    const ids = stale.map(run => run.id);
    await this.runs.failRuns(ids, 'the run was interrupted and did not finish');

    logger.warn({ count: ids.length, maxRunMinutes }, 'Closed out interrupted agent runs');
    return ids.length;
  }

  /**
   * One autopilot pass over a workspace: every group whose autopilot is on and
   * that has not already produced its batch today drafts, renders and queues.
   */
  async runForUser(userId: string, trigger: string = MANUAL_TRIGGER): Promise<AutopilotRunSummary> {
    const policy = await this.policies.findByUser(userId);
    const mode = policy?.mode ?? AutomationMode.manual;
    const autoPublish = policy?.autoPublish ?? true;
    const maxPostsPerDay = policy?.maxPostsPerDay ?? DEFAULT_MAX_POSTS_PER_DAY;

    const groups = await this.groups.findAutopilotGroups([userId]);
    const since = startOfToday();
    let remaining = Math.max(maxPostsPerDay - (await this.runs.countSince(userId, since)), 0);

    const outcomes: AutopilotGroupOutcome[] = [];
    let drafted = 0;

    for (const group of groups) {
      if (remaining <= 0) {
        outcomes.push(this.skipped(group, 'daily post limit reached'));
        continue;
      }

      const outcome = await this.runGroup(userId, group, trigger, autoPublish, remaining);
      outcomes.push(outcome);
      drafted += outcome.drafted;
      remaining -= outcome.drafted;
    }

    if (drafted > 0) {
      await this.policies.touchLastRun(userId);
    }

    return { userId, mode, drafted, groups: outcomes };
  }

  /** Cron entry point: every workspace whose switch is set to autopilot. */
  async runDueUsers(): Promise<{ users: number; drafted: number }> {
    const userIds = await this.policies.findRunnableUserIds();

    let drafted = 0;
    for (const userId of userIds) {
      try {
        const summary = await this.runForUser(userId, AUTOPILOT_TRIGGER);
        drafted += summary.drafted;
      } catch (err) {
        logger.error(
          { userId, error: err instanceof Error ? err.message : String(err) },
          'Autopilot run failed for user'
        );
      }
    }

    return { users: userIds.length, drafted };
  }

  private async runGroup(
    userId: string,
    group: AccountGroupWithMembers,
    trigger: string,
    autoPublish: boolean,
    remaining: number
  ): Promise<AutopilotGroupOutcome> {
    // A scheduled tick fires far more often than a posting slot comes round, so
    // a group that already produced its batch today is left alone.
    if (trigger === AUTOPILOT_TRIGGER) {
      const today = await this.runs.countForGroupSince(group.id, startOfToday());
      if (today > 0) {
        return this.skipped(group, 'already ran today');
      }
    }

    if (!group.topics.length) {
      return this.skipped(group, 'no topics configured for this group');
    }

    const targets = await this.groups.findActiveTargets(group.id);
    if (!targets.length) {
      return this.skipped(group, 'no switched-on accounts in this group');
    }

    const covered = await this.runs.findRecentTopics(group.id);
    const wanted = Math.min(group.postsPerRun, remaining);

    let drafted = 0;
    let failure: string | null = null;

    for (let index = 0; index < wanted; index += 1) {
      const topic = this.pickTopic(group.topics, [...covered, ...group.topics.slice(0, drafted)]);
      const error = await this.draftOne(userId, group, topic, trigger, autoPublish, targets.length);

      if (error) {
        failure = error;
        break;
      }
      drafted += 1;
    }

    return { groupId: group.id, groupName: group.name, drafted, skipped: null, failed: failure };
  }

  private async draftOne(
    userId: string,
    group: AccountGroupWithMembers,
    topic: string,
    trigger: string,
    autoPublish: boolean,
    accountsTargeted: number
  ): Promise<string | null> {
    const run = await this.runs.start({
      userId,
      groupId: group.id,
      agent: POST_AGENT_NAME,
      trigger,
      topic,
    });

    try {
      // The agent traces into this run rather than opening a second one, so the
      // whole pipeline reports under one row.
      const draft = await this.postAgent.createFromBrief({
        topic,
        format: asPostFormat(group.defaultFormat),
        serviceLine: group.serviceLine ?? undefined,
        audience: group.audience ?? undefined,
        userId,
        groupId: group.id,
        autoPublish,
        trigger,
        runId: run.id,
      });

      // Autopilot signs the draft off itself. The craft audit still gates it —
      // artwork that failed the audit stays in the queue for a human to look at.
      const finished =
        autoPublish && draft.status === PostDraftStatus.awaiting_approval
          ? await this.postAgent.approve(draft.id, AUTOPILOT_ACTOR)
          : draft;

      await this.runs.finish(run.id, {
        status: AgentRunStatus.succeeded,
        draftId: finished.id,
        postIds: finished.socialPostIds,
        accountsTargeted,
      });

      return null;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.runs.finish(run.id, {
        status: AgentRunStatus.failed,
        accountsTargeted,
        errorMessage: message,
      });

      logger.error({ userId, groupId: group.id, topic, error: message }, 'Autopilot draft failed');
      return message;
    }
  }

  /** The first topic the group has not covered lately, else the top of the list. */
  private pickTopic(topics: string[], covered: string[]): string {
    const used = new Set(covered);
    return topics.find(topic => !used.has(topic)) ?? topics[0];
  }

  private skipped(group: AccountGroupWithMembers, reason: string): AutopilotGroupOutcome {
    return { groupId: group.id, groupName: group.name, drafted: 0, skipped: reason, failed: null };
  }

  private async toPolicyDTO(
    userId: string,
    policy: Awaited<ReturnType<AutomationPolicyRepository['findByUser']>>
  ): Promise<AutomationPolicyDTO> {
    const [autopilotGroupCount, activeAccountCount, postsUsedToday] = await Promise.all([
      this.groups.countAutopilotGroupsForUser(userId),
      this.groups.countActiveAccountsForUser(userId),
      this.runs.countSince(userId, startOfToday()),
    ]);

    return {
      mode: policy?.mode ?? AutomationMode.manual,
      autoPublish: policy?.autoPublish ?? true,
      defaultGroupId: policy?.defaultGroupId ?? null,
      maxPostsPerDay: policy?.maxPostsPerDay ?? DEFAULT_MAX_POSTS_PER_DAY,
      postsUsedToday,
      pausedUntil: policy?.pausedUntil?.toISOString() ?? null,
      lastRunAt: policy?.lastRunAt?.toISOString() ?? null,
      autopilotGroupCount,
      activeAccountCount,
    };
  }

  /** The run in flight for this workspace, if any — what the page resumes onto. */
  async getActiveRun(userId: string): Promise<AgentRunDTO | null> {
    const active = await this.runs.findActiveForUser(userId);
    if (!active) {
      return null;
    }
    return this.getRun(userId, active.id);
  }

  /** One run with its stages, for the live tracker. */
  async getRun(userId: string, runId: string): Promise<AgentRunDTO> {
    const run = await this.runs.findByIdForUser(runId, userId);
    if (!run) {
      throw new NotFoundError('agent run not found');
    }
    return this.withResumable(this.withCancellable(this.toRunDTO(run)));
  }

  /**
   * Whether a failed run can still be picked up. Only failed runs are checked,
   * so a page of successes costs no cache reads at all.
   */
  private async withResumable(run: AgentRunDTO): Promise<AgentRunDTO> {
    if (run.status !== AgentRunStatus.failed) {
      return run;
    }
    return { ...run, resumable: await this.postAgent.isResumable(run.id) };
  }

  private withCancellable(run: AgentRunDTO): AgentRunDTO {
    return run.status === AgentRunStatus.running
      ? { ...run, cancellable: isRunCancellable(run.id) }
      : run;
  }

  private toStepDTO(step: {
    key: string;
    label: string;
    sequence: number;
    status: AgentStepStatus;
    detail: string | null;
    errorMessage: string | null;
    startedAt: Date | null;
    finishedAt: Date | null;
  }): AgentRunStepDTO {
    return {
      key: step.key,
      label: step.label,
      sequence: step.sequence,
      status: step.status,
      detail: step.detail,
      errorMessage: step.errorMessage,
      startedAt: step.startedAt?.toISOString() ?? null,
      finishedAt: step.finishedAt?.toISOString() ?? null,
      durationMs:
        step.startedAt && step.finishedAt
          ? step.finishedAt.getTime() - step.startedAt.getTime()
          : null,
    };
  }

  private toRunDTO(run: {
    id: string;
    groupId: string | null;
    group: { id: string; name: string } | null;
    agent: string;
    trigger: string;
    status: AgentRunStatus;
    topic: string | null;
    draftId: string | null;
    postIds: string[];
    accountsTargeted: number;
    errorMessage: string | null;
    startedAt: Date;
    finishedAt: Date | null;
    steps?: Array<Parameters<AutomationService['toStepDTO']>[0]>;
  }): AgentRunDTO {
    return {
      id: run.id,
      groupId: run.groupId,
      groupName: run.group?.name ?? null,
      agent: run.agent,
      trigger: run.trigger,
      status: run.status,
      topic: run.topic,
      draftId: run.draftId,
      postIds: run.postIds,
      accountsTargeted: run.accountsTargeted,
      errorMessage: run.errorMessage,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      durationMs: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
      steps: (run.steps ?? []).map(step => this.toStepDTO(step)),
      resumable: false,
      cancellable: false,
    };
  }
}

export const automationService = new AutomationService();
