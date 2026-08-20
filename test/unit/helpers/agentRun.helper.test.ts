import {
  POST_AGENT_STEPS,
  RUN_STATE_KEYS,
  RUN_STATE_VERSIONS,
  pluralise,
  runStateKey,
} from '@/helpers/agentRun.helper';
import { describe, expect, it } from 'vitest';

describe('runStateKey', () => {
  it('scopes working state to one run', () => {
    expect(runStateKey('run-1', RUN_STATE_KEYS.copy)).toContain('run-1');
    expect(runStateKey('run-1', RUN_STATE_KEYS.copy)).not.toEqual(
      runStateKey('run-2', RUN_STATE_KEYS.copy)
    );
  });

  it('keeps the stages of one run apart', () => {
    const keys = Object.values(RUN_STATE_KEYS).map(part => runStateKey('run-1', part));
    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * The bug this guards: a cached payload written before a deploy being served
   * back into code that expects a different shape, which reads as "the fix did
   * not work" rather than as a stale cache.
   */
  it('retires the entries of a stage whose payload changed', () => {
    expect(RUN_STATE_VERSIONS[RUN_STATE_KEYS.art]).toBeGreaterThan(1);
    expect(runStateKey('run-1', RUN_STATE_KEYS.art)).toBe('agent:run:run-1:art.v2');
    expect(runStateKey('run-1', RUN_STATE_KEYS.art)).not.toBe('agent:run:run-1:art');
  });

  it('keeps reading what earlier runs wrote for a stage that never changed', () => {
    // The copy is the expensive stage. Retiring art must not cost it.
    expect(RUN_STATE_VERSIONS[RUN_STATE_KEYS.copy]).toBe(1);
    expect(runStateKey('run-1', RUN_STATE_KEYS.copy)).toBe('agent:run:run-1:copy');
    expect(runStateKey('run-1', RUN_STATE_KEYS.brief)).toBe('agent:run:run-1:brief');
  });

  it('gives every stage a version', () => {
    for (const part of Object.values(RUN_STATE_KEYS)) {
      expect(RUN_STATE_VERSIONS[part]).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('POST_AGENT_STEPS', () => {
  it('is ordered by sequence with no gaps, so the timeline draws in order', () => {
    const sequences = POST_AGENT_STEPS.map(step => step.sequence);
    expect(sequences).toEqual([...sequences].sort((a, b) => a - b));
    expect(sequences).toEqual(sequences.map((_, index) => index));
  });

  it('has a unique key per stage', () => {
    const keys = POST_AGENT_STEPS.map(step => step.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('gives every stage a label to render', () => {
    expect(POST_AGENT_STEPS.every(step => step.label.length > 0)).toBe(true);
  });
});

describe('pluralise', () => {
  it('keeps the singular for exactly one', () => {
    expect(pluralise(1, 'page')).toBe('1 page');
  });

  it('pluralises zero and many', () => {
    expect(pluralise(0, 'page')).toBe('0 pages');
    expect(pluralise(4, 'page')).toBe('4 pages');
  });

  it('takes an explicit plural', () => {
    expect(pluralise(2, 'photograph', 'photographs')).toBe('2 photographs');
  });
});
