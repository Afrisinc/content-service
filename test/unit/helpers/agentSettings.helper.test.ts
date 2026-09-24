import { describe, expect, it } from 'vitest';
import type { AgentDefinition } from '@/config/agentRegistry';
import {
  isAgentActiveForPolicy,
  isAgentSwitchedOn,
  isPolicyLive,
  isWorkspaceAgentActive,
  parseAgentChoices,
  withAgentChoice,
  type PolicySnapshot,
} from '@/helpers/agentSettings.helper';

const NOW = new Date('2026-09-24T10:00:00.000Z');

const agent = (overrides: Partial<AgentDefinition> = {}): AgentDefinition => ({
  key: 'news',
  name: 'News agent',
  description: '',
  scope: 'workspace',
  requiresAutopilot: true,
  enabledByDefault: false,
  allowedByServer: () => true,
  schedules: () => [],
  ...overrides,
});

const policy = (overrides: Partial<PolicySnapshot> = {}): PolicySnapshot => ({
  mode: 'autopilot',
  pausedUntil: null,
  agents: {},
  ...overrides,
});

describe('parseAgentChoices', () => {
  it('keeps known agents with boolean values only', () => {
    expect(parseAgentChoices({ news: true, post: false, ghost: true, analytics: 'yes' })).toEqual({
      news: true,
      post: false,
    });
  });

  it.each([null, undefined, 'news', [true], 7])('reads %s as no choices', value => {
    expect(parseAgentChoices(value)).toEqual({});
  });
});

describe('withAgentChoice', () => {
  it('sets one agent and keeps the others, dropping junk', () => {
    expect(withAgentChoice({ post: false, junk: 1 }, 'news', true)).toEqual({
      post: false,
      news: true,
    });
  });
});

describe('isAgentSwitchedOn', () => {
  it('uses the stored choice, else the default', () => {
    expect(isAgentSwitchedOn(agent(), { news: true })).toBe(true);
    expect(isAgentSwitchedOn(agent({ enabledByDefault: true }), { news: false })).toBe(false);
    expect(isAgentSwitchedOn(agent({ enabledByDefault: true }), {})).toBe(true);
  });
});

describe('isPolicyLive', () => {
  it('is live on autopilot when not paused or when the pause has passed', () => {
    expect(isPolicyLive(policy(), NOW)).toBe(true);
    expect(isPolicyLive(policy({ pausedUntil: new Date('2026-09-24T09:00:00Z') }), NOW)).toBe(true);
  });

  it('is not live on manual or while paused', () => {
    expect(isPolicyLive(policy({ mode: 'manual' }), NOW)).toBe(false);
    expect(isPolicyLive(policy({ pausedUntil: new Date('2026-09-24T11:00:00Z') }), NOW)).toBe(
      false
    );
  });
});

describe('isAgentActiveForPolicy', () => {
  it('never runs an agent the server does not allow', () => {
    const blocked = agent({ allowedByServer: () => false });
    expect(isAgentActiveForPolicy(blocked, policy({ agents: { news: true } }), NOW)).toBe(false);
  });

  it('needs autopilot for an autopilot agent', () => {
    expect(isAgentActiveForPolicy(agent(), policy({ agents: { news: true } }), NOW)).toBe(true);
    expect(
      isAgentActiveForPolicy(agent(), policy({ mode: 'manual', agents: { news: true } }), NOW)
    ).toBe(false);
  });

  it('runs a non-autopilot agent in manual mode when switched on', () => {
    const sync = agent({ requiresAutopilot: false, enabledByDefault: true });
    expect(isAgentActiveForPolicy(sync, policy({ mode: 'manual' }), NOW)).toBe(true);
    expect(isAgentActiveForPolicy(sync, policy({ agents: { news: false } }), NOW)).toBe(false);
  });

  it('falls back to the default when the user has no policy yet', () => {
    expect(isAgentActiveForPolicy(agent(), null, NOW)).toBe(false);
    expect(
      isAgentActiveForPolicy(agent({ requiresAutopilot: false, enabledByDefault: true }), null, NOW)
    ).toBe(true);
  });
});

describe('isWorkspaceAgentActive', () => {
  it('runs while any live policy wants it', () => {
    const policies = [policy({ agents: { news: false } }), policy({ agents: { news: true } })];
    expect(isWorkspaceAgentActive(agent(), policies, NOW)).toBe(true);
  });

  it('stays off when nobody on autopilot wants it', () => {
    const policies = [policy({ mode: 'manual', agents: { news: true } }), policy()];
    expect(isWorkspaceAgentActive(agent(), policies, NOW)).toBe(false);
    expect(isWorkspaceAgentActive(agent(), [], NOW)).toBe(false);
  });

  it('uses the default for a non-autopilot agent when nobody has a policy', () => {
    const sync = agent({ requiresAutopilot: false, enabledByDefault: true });
    expect(isWorkspaceAgentActive(sync, [], NOW)).toBe(true);
    expect(isWorkspaceAgentActive(agent({ requiresAutopilot: false }), [], NOW)).toBe(false);
  });

  it('is off whenever the server says so', () => {
    const blocked = agent({ allowedByServer: () => false, requiresAutopilot: false });
    expect(isWorkspaceAgentActive(blocked, [], NOW)).toBe(false);
  });
});
