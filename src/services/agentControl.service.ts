import { AgentRunStatus } from '@prisma/client';
import {
  AGENT_KEYS,
  AGENT_REGISTRY,
  runOwnersFor,
  type AgentKey,
  type AgentSchedule,
  type AgentScope,
} from '@/config/agentRegistry';
import {
  isAgentActiveForPolicy,
  isAgentSwitchedOn,
  isPolicyLive,
  isWorkspaceAgentActive,
  parseAgentChoices,
  withAgentChoice,
  type PolicySnapshot,
} from '@/helpers/agentSettings.helper';
import { agentRunRepository, type AgentRunRepository } from '@/repositories/agentRun.repository';
import {
  automationPolicyRepository,
  type AutomationPolicyRepository,
} from '@/repositories/automationPolicy.repository';
import { logger } from '@/utils/logger';

/** Why an agent is not running, in the order the checks apply. */
export type AgentBlocker = 'server' | 'switch' | 'autopilot' | null;

export interface AgentLastRunDTO {
  id: string;
  status: AgentRunStatus;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  summary: string | null;
}

export interface AgentStatusDTO {
  key: AgentKey;
  name: string;
  description: string;
  scope: AgentScope;
  requiresAutopilot: boolean;
  enabledByDefault: boolean;
  schedules: AgentSchedule[];
  allowedByServer: boolean;
  /** This user's switch, after falling back to the default. */
  enabled: boolean;
  /** False while the user has never touched this switch. */
  chosen: boolean;
  /** Runs right now — for this user, or for everyone when workspace-wide. */
  active: boolean;
  blockedBy: AgentBlocker;
  lastRun: AgentLastRunDTO | null;
  runsToday: number;
}

type LatestRun = Awaited<ReturnType<AgentRunRepository['findLatestPerAgent']>>[number];

function startOfToday(now: Date): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return start;
}

function runSummary(run: LatestRun): string | null {
  if (run.errorMessage) {
    return run.errorMessage;
  }
  const detail = [...run.steps].reverse().find(step => step.detail)?.detail;
  return detail ?? run.topic;
}

function toLastRun(run: LatestRun | undefined): AgentLastRunDTO | null {
  if (!run) {
    return null;
  }
  return {
    id: run.id,
    status: run.status,
    trigger: run.trigger,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    summary: runSummary(run),
  };
}

export class AgentControlService {
  constructor(
    private readonly policies: AutomationPolicyRepository = automationPolicyRepository,
    private readonly runs: AgentRunRepository = agentRunRepository
  ) {}

  async list(userId: string): Promise<AgentStatusDTO[]> {
    const now = new Date();
    const owners = runOwnersFor(userId);
    const [own, snapshots, latest, counts] = await Promise.all([
      this.policies.findByUser(userId),
      this.policies.findAgentSnapshots(),
      this.runs.findLatestPerAgent(owners),
      this.runs.countByAgentSince(owners, startOfToday(now)),
    ]);

    return AGENT_KEYS.map(key => {
      const runAgent = AGENT_REGISTRY[key].runAgent;
      return {
        ...this.describe(key, own, snapshots, now),
        lastRun: toLastRun(latest.find(run => run.agent === runAgent)),
        runsToday: counts[runAgent] ?? 0,
      };
    });
  }

  async setEnabled(userId: string, key: AgentKey, enabled: boolean): Promise<AgentStatusDTO> {
    const current = await this.policies.findByUser(userId);
    await this.policies.saveAgentChoices(userId, withAgentChoice(current?.agents, key, enabled));
    logger.info({ userId, agent: key, enabled }, 'agent_control.switched');

    const statuses = await this.list(userId);
    return statuses.find(status => status.key === key) as AgentStatusDTO;
  }

  /**
   * The gate every scheduled agent checks at the top of its tick. A user-scoped
   * agent is active while any user runs it; the job itself then picks the users.
   */
  async isActive(key: AgentKey, now: Date = new Date()): Promise<boolean> {
    const agent = AGENT_REGISTRY[key];
    if (!agent.allowedByServer()) {
      return false;
    }
    const snapshots = await this.policies.findAgentSnapshots();
    return isWorkspaceAgentActive(agent, snapshots, now);
  }

  private describe(
    key: AgentKey,
    own: PolicySnapshot | null,
    snapshots: PolicySnapshot[],
    now: Date
  ): Omit<AgentStatusDTO, 'lastRun' | 'runsToday'> {
    const agent = AGENT_REGISTRY[key];
    const allowedByServer = agent.allowedByServer();
    const enabled = isAgentSwitchedOn(agent, own?.agents);
    const active =
      agent.scope === 'workspace'
        ? isWorkspaceAgentActive(agent, snapshots, now)
        : isAgentActiveForPolicy(agent, own, now);

    return {
      key,
      name: agent.name,
      description: agent.description,
      scope: agent.scope,
      requiresAutopilot: agent.requiresAutopilot,
      enabledByDefault: agent.enabledByDefault,
      schedules: agent.schedules(),
      allowedByServer,
      enabled,
      chosen: key in parseAgentChoices(own?.agents),
      active,
      blockedBy: active
        ? null
        : this.blocker(allowedByServer, enabled, agent.requiresAutopilot, own, now),
    };
  }

  private blocker(
    allowedByServer: boolean,
    enabled: boolean,
    requiresAutopilot: boolean,
    own: PolicySnapshot | null,
    now: Date
  ): AgentBlocker {
    if (!allowedByServer) {
      return 'server';
    }
    if (!enabled) {
      return 'switch';
    }
    if (requiresAutopilot && !(own && isPolicyLive(own, now))) {
      return 'autopilot';
    }
    return null;
  }
}

export const agentControlService = new AgentControlService();
