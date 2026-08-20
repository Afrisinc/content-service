import { AgentRunRepository, agentRunRepository } from '@/repositories/agentRun.repository';
import { AgentStepKey, AgentStepDefinition, POST_AGENT_STEPS } from '@/helpers/agentRun.helper';
import { logger } from '@/utils/logger';
import { AgentRunStatus, AgentStepStatus } from '@prisma/client';

export interface BeginRunInput {
  userId: string;
  groupId?: string | null;
  agent: string;
  trigger: string;
  topic?: string;
  /** Adopt a run someone else already opened instead of starting a second one. */
  runId?: string;
}

/**
 * Records what an agent is doing, stage by stage, so the dashboard can follow a
 * run while it happens.
 *
 * Every method here is best-effort: a trace that cannot be written must never
 * take down the work it is tracing, so failures are logged and swallowed. The
 * one exception is `track`, which rethrows the *traced* operation's error.
 */
export class AgentRunTracker {
  constructor(
    private readonly runs: AgentRunRepository = agentRunRepository,
    private readonly steps: ReadonlyArray<AgentStepDefinition> = POST_AGENT_STEPS
  ) {}

  async begin(input: BeginRunInput): Promise<string | null> {
    try {
      const runId =
        input.runId ??
        (
          await this.runs.start({
            userId: input.userId,
            groupId: input.groupId ?? null,
            agent: input.agent,
            trigger: input.trigger,
            topic: input.topic,
          })
        ).id;

      await this.runs.seedSteps(runId, this.steps);
      return runId;
    } catch (err) {
      this.warn('begin', err);
      return null;
    }
  }

  /** Run one stage, marking it running, then succeeded or failed. */
  async track<T>(
    runId: string | null,
    key: AgentStepKey,
    operation: () => Promise<T>,
    describe?: (result: T) => string
  ): Promise<T> {
    if (!runId) {
      return operation();
    }

    await this.safely(() => this.runs.startStep(runId, key), 'startStep');

    try {
      const result = await operation();
      await this.succeed(runId, key, describe?.(result));
      return result;
    } catch (err) {
      await this.fail(runId, key, err instanceof Error ? err.message : String(err));
      throw err;
    }
  }

  async succeed(runId: string | null, key: AgentStepKey, detail?: string): Promise<void> {
    await this.mark(runId, key, AgentStepStatus.succeeded, { detail });
  }

  async fail(runId: string | null, key: AgentStepKey, errorMessage: string): Promise<void> {
    await this.mark(runId, key, AgentStepStatus.failed, { errorMessage });
  }

  async skip(runId: string | null, key: AgentStepKey, detail?: string): Promise<void> {
    await this.mark(runId, key, AgentStepStatus.skipped, { detail });
  }

  async waitingOn(runId: string | null, key: AgentStepKey): Promise<void> {
    if (!runId) {
      return;
    }
    await this.safely(() => this.runs.startStep(runId, key), 'waitingOn');
  }

  async finish(
    runId: string | null,
    data: {
      status: AgentRunStatus;
      draftId?: string;
      postIds?: string[];
      accountsTargeted?: number;
      errorMessage?: string;
    }
  ): Promise<void> {
    if (!runId) {
      return;
    }

    await this.safely(async () => {
      if (data.status === AgentRunStatus.failed) {
        await this.runs.abandonUnfinishedSteps(runId);
      }
      await this.runs.finish(runId, data);
    }, 'finish');
  }

  private async mark(
    runId: string | null,
    key: AgentStepKey,
    status: AgentStepStatus,
    data: { detail?: string; errorMessage?: string }
  ): Promise<void> {
    if (!runId) {
      return;
    }
    await this.safely(() => this.runs.finishStep(runId, key, { status, ...data }), 'mark');
  }

  private async safely(operation: () => Promise<unknown>, at: string): Promise<void> {
    try {
      await operation();
    } catch (err) {
      this.warn(at, err);
    }
  }

  private warn(at: string, err: unknown): void {
    logger.warn(
      { at, error: err instanceof Error ? err.message : String(err) },
      'Agent run trace could not be written'
    );
  }
}

export const agentRunTracker = new AgentRunTracker();
