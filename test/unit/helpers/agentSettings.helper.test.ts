import { describe, expect, it } from 'vitest';
import type { AgentDefinition } from '@/config/agentRegistry';
import {
  isAgentActiveForPolicy,
  isAgentSwitchedOn,
  isPolicyLive,
  isWorkspaceAgentActive,
  parseAgentChoices,
  isRunDay,
  parseNewsSettings,
  parseRunDays,
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

describe('parseNewsSettings', () => {
  it('reads a saved batch size', () => {
    expect(parseNewsSettings({ batchSize: 2 }, 1)).toEqual({
      batchSize: 2,
      days: [0, 1, 2, 3, 4, 5, 6],
    });
  });

  it.each([
    ['nothing saved', undefined],
    ['null', null],
    ['an array', [2]],
    ['a missing key', {}],
    ['a string', { batchSize: '2' }],
    ['a fraction', { batchSize: 1.5 }],
    ['zero', { batchSize: 0 }],
    ['a negative number', { batchSize: -3 }],
  ])('falls back to the server default for %s', (_label, value) => {
    expect(parseNewsSettings(value, 1)).toEqual({ batchSize: 1, days: [0, 1, 2, 3, 4, 5, 6] });
  });
});

describe('parseNewsSettings run days', () => {
  it('reads the saved days', () => {
    expect(parseNewsSettings({ batchSize: 1, days: [1, 4] }, 1).days).toEqual([1, 4]);
  });
});

describe('parseRunDays', () => {
  it('sorts the days and drops repeats', () => {
    expect(parseRunDays([5, 1, 5, 3])).toEqual([1, 3, 5]);
  });

  it('ignores anything that is not a weekday number', () => {
    expect(parseRunDays([1, 7, -1, 2.5, '3', null, 6])).toEqual([1, 6]);
  });

  it.each([undefined, null, 'mon', 3, {}, [], [9, 'x']])(
    'runs every day when %j leaves no usable day',
    value => {
      expect(parseRunDays(value)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    }
  );
});

describe('isRunDay', () => {
  const MONDAY = new Date('2026-10-05T07:00:00.000Z');

  it('is true on a chosen day', () => {
    expect(isRunDay([1], MONDAY)).toBe(true);
  });

  it('is false on any other day', () => {
    expect(isRunDay([0, 2, 3, 4, 5, 6], MONDAY)).toBe(false);
  });

  it('counts the day in UTC, so a late-evening UTC time is still that day', () => {
    expect(isRunDay([1], new Date('2026-10-05T23:59:00.000Z'))).toBe(true);
    expect(isRunDay([1], new Date('2026-10-06T00:00:00.000Z'))).toBe(false);
  });

  it('numbers Sunday as 0', () => {
    expect(isRunDay([0], new Date('2026-10-04T12:00:00.000Z'))).toBe(true);
  });
});
