import { AgentRunStatus, AgentStepStatus } from '@prisma/client';
import { AGENT_REGISTRY, WORKSPACE_RUN_OWNER, type AgentKey } from '@/config/agentRegistry';
import { agentRunRepository, type AgentRunRepository } from '@/repositories/agentRun.repository';
import { logger } from '@/utils/logger';

export type RunTrigger = 'schedule' | 'manual';

export interface RunOutcome {
  status: AgentRunStatus;
  detail: string;
  errorMessage?: string;
  keep?: boolean;
}

export interface RecordRunInput<T> {
  agent: AgentKey;
  ownerId?: string;
  groupId?: string | null;
  trigger: RunTrigger;
  topic: string;
  stepLabel: string;
  execute: () => Promise<T>;
  outcome: (result: T) => RunOutcome;
}

const STEP_KEY = 'run';

const STEP_STATUS: Record<AgentRunStatus, AgentStepStatus> = {
  running: AgentStepStatus.running,
  succeeded: AgentStepStatus.succeeded,
  failed: AgentStepStatus.failed,
  skipped: AgentStepStatus.skipped,
};

const MAX_MESSAGE_LENGTH = 1000;

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, MAX_MESSAGE_LENGTH);
}

export class AgentRunRecorder {
  constructor(private readonly runs: AgentRunRepository = agentRunRepository) {}

  async record<T>(input: RecordRunInput<T>): Promise<T> {
    const runId = await this.open(input);

    let result: T;
    try {
      result = await input.execute();
    } catch (error) {
      await this.close(runId, {
        status: AgentRunStatus.failed,
        detail: '',
        errorMessage: messageOf(error),
      });
      throw error;
    }

    await this.close(runId, input.outcome(result));
    return result;
  }

  private async open<T>(input: RecordRunInput<T>): Promise<string | null> {
    try {
      const run = await this.runs.start({
        userId: input.ownerId ?? WORKSPACE_RUN_OWNER,
        ...(input.groupId ? { groupId: input.groupId } : {}),
        agent: AGENT_REGISTRY[input.agent].runAgent,
        trigger: input.trigger,
        topic: input.topic,
      });
      await this.runs.seedSteps(run.id, [{ key: STEP_KEY, label: input.stepLabel, sequence: 0 }]);
      await this.runs.startStep(run.id, STEP_KEY);
      return run.id;
    } catch (error) {
      this.warn('open', error);
      return null;
    }
  }

  private async close(runId: string | null, outcome: RunOutcome): Promise<void> {
    if (!runId) {
      return;
    }

    try {
      if (outcome.keep === false) {
        await this.runs.discard(runId);
        return;
      }

      const errorMessage = outcome.errorMessage?.slice(0, MAX_MESSAGE_LENGTH);
      await this.runs.finishStep(runId, STEP_KEY, {
        status: STEP_STATUS[outcome.status],
        ...(outcome.detail ? { detail: outcome.detail } : {}),
        ...(errorMessage ? { errorMessage } : {}),
      });
      await this.runs.finish(runId, {
        status: outcome.status,
        ...(errorMessage ? { errorMessage } : {}),
      });
    } catch (error) {
      this.warn('close', error);
    }
  }

  private warn(at: string, error: unknown): void {
    logger.warn({ at, error: messageOf(error) }, 'Agent run could not be recorded');
  }
}

export const agentRunRecorder = new AgentRunRecorder();
