import { AutomationMode } from '@prisma/client';
import { isAgentKey, type AgentDefinition, type AgentKey } from '@/config/agentRegistry';

export type AgentChoices = Partial<Record<AgentKey, boolean>>;

export interface PolicySnapshot {
  mode: AutomationMode;
  pausedUntil: Date | null;
  agents: unknown;
}

/** Reads the stored JSON defensively: unknown keys and non-boolean values are ignored. */
export function parseAgentChoices(value: unknown): AgentChoices {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const choices: AgentChoices = {};
  for (const [key, enabled] of Object.entries(value as Record<string, unknown>)) {
    if (isAgentKey(key) && typeof enabled === 'boolean') {
      choices[key] = enabled;
    }
  }
  return choices;
}

export function withAgentChoice(current: unknown, key: AgentKey, enabled: boolean): AgentChoices {
  return { ...parseAgentChoices(current), [key]: enabled };
}

/** The agent's switch for one policy: the user's choice, else the registry default. */
export function isAgentSwitchedOn(agent: AgentDefinition, agents: unknown): boolean {
  return parseAgentChoices(agents)[agent.key] ?? agent.enabledByDefault;
}

export function isPolicyLive(policy: PolicySnapshot, now: Date = new Date()): boolean {
  return (
    policy.mode === AutomationMode.autopilot &&
    (policy.pausedUntil === null || policy.pausedUntil <= now)
  );
}

/** Whether one user's policy runs this agent right now. */
export function isAgentActiveForPolicy(
  agent: AgentDefinition,
  policy: PolicySnapshot | null,
  now: Date = new Date()
): boolean {
  if (!agent.allowedByServer()) {
    return false;
  }
  if (!policy) {
    return !agent.requiresAutopilot && agent.enabledByDefault;
  }
  if (agent.requiresAutopilot && !isPolicyLive(policy, now)) {
    return false;
  }
  return isAgentSwitchedOn(agent, policy.agents);
}

/**
 * A workspace agent runs once for everybody. It is on while any policy that
 * counts wants it: for an autopilot agent only live autopilot policies count;
 * otherwise every policy does, and with none at all its default decides.
 */
export function isWorkspaceAgentActive(
  agent: AgentDefinition,
  policies: PolicySnapshot[],
  now: Date = new Date()
): boolean {
  if (!agent.allowedByServer()) {
    return false;
  }
  if (!agent.requiresAutopilot && policies.length === 0) {
    return agent.enabledByDefault;
  }
  return policies.some(policy => isAgentActiveForPolicy(agent, policy, now));
}
