import { POST_AGENT_STEPS, pluralise } from '@/helpers/agentRun.helper';
import { AgentRunTracker } from '@/services/agentRunTracker.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function build() {
  const runs = {
    start: vi.fn(async () => ({ id: 'run-1' })),
    seedSteps: vi.fn(async () => ({ count: POST_AGENT_STEPS.length })),
    startStep: vi.fn(async () => ({ count: 1 })),
    finishStep: vi.fn(async () => ({ count: 1 })),
    abandonUnfinishedSteps: vi.fn(async () => ({ count: 2 })),
    finish: vi.fn(async () => ({ id: 'run-1' })),
  };

  return { tracker: new AgentRunTracker(runs as never), runs };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pluralise', () => {
  it('keeps the singular for one', () => {
    expect(pluralise(1, 'frame')).toBe('1 frame');
  });

  it('pluralises everything else, zero included', () => {
    expect(pluralise(0, 'frame')).toBe('0 frames');
    expect(pluralise(3, 'frame')).toBe('3 frames');
  });

  it('takes an irregular plural', () => {
    expect(pluralise(2, 'photograph', 'photographs')).toBe('2 photographs');
  });
});

describe('begin', () => {
  it('opens a run and draws the whole pipeline up front', async () => {
    const { tracker, runs } = build();

    const runId = await tracker.begin({ userId: 'user-1', agent: 'post-agent', trigger: 'manual' });

    expect(runId).toBe('run-1');
    expect(runs.seedSteps).toHaveBeenCalledWith('run-1', POST_AGENT_STEPS);
  });

  it('adopts a run someone else opened instead of starting a second', async () => {
    const { tracker, runs } = build();

    const runId = await tracker.begin({
      userId: 'user-1',
      agent: 'post-agent',
      trigger: 'autopilot',
      runId: 'existing-run',
    });

    expect(runId).toBe('existing-run');
    expect(runs.start).not.toHaveBeenCalled();
    expect(runs.seedSteps).toHaveBeenCalledWith('existing-run', POST_AGENT_STEPS);
  });

  it('returns null rather than throwing when the trace cannot be opened', async () => {
    const { tracker, runs } = build();
    runs.start.mockRejectedValueOnce(new Error('db down') as never);

    await expect(
      tracker.begin({ userId: 'user-1', agent: 'post-agent', trigger: 'manual' })
    ).resolves.toBeNull();
  });
});

describe('track', () => {
  it('marks a stage running, then succeeded, and returns the result', async () => {
    const { tracker, runs } = build();

    const result = await tracker.track('run-1', 'copy', async () => 'written');

    expect(result).toBe('written');
    expect(runs.startStep).toHaveBeenCalledWith('run-1', 'copy');
    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'copy', {
      status: 'succeeded',
      detail: undefined,
    });
  });

  it('records the detail the caller derives from the result', async () => {
    const { tracker, runs } = build();

    await tracker.track(
      'run-1',
      'render',
      async () => ({ slides: [1, 2, 3] }),
      rendered => pluralise(rendered.slides.length, 'frame')
    );

    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'render', {
      status: 'succeeded',
      detail: '3 frames',
    });
  });

  it('marks the stage failed and rethrows so the caller still sees the error', async () => {
    const { tracker, runs } = build();

    await expect(
      tracker.track('run-1', 'render', async () => {
        throw new Error('render down');
      })
    ).rejects.toThrow('render down');

    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'render', {
      status: 'failed',
      errorMessage: 'render down',
    });
  });

  it('still runs the operation when there is no trace to write to', async () => {
    const { tracker, runs } = build();

    await expect(tracker.track(null, 'copy', async () => 'written')).resolves.toBe('written');
    expect(runs.startStep).not.toHaveBeenCalled();
  });

  it('never lets a broken trace take down the work it is tracing', async () => {
    const { tracker, runs } = build();
    runs.startStep.mockRejectedValueOnce(new Error('db down') as never);
    runs.finishStep.mockRejectedValueOnce(new Error('db down') as never);

    await expect(tracker.track('run-1', 'copy', async () => 'written')).resolves.toBe('written');
  });
});

describe('stage marks', () => {
  it.each([
    ['succeed', 'succeeded'],
    ['skip', 'skipped'],
  ] as const)('%s writes status %s', async (method, status) => {
    const { tracker, runs } = build();

    await tracker[method]('run-1', 'approval', 'because');

    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'approval', {
      status,
      detail: 'because',
    });
  });

  it('fail writes the message', async () => {
    const { tracker, runs } = build();

    await tracker.fail('run-1', 'audit', 'two blocking findings');

    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'audit', {
      status: 'failed',
      errorMessage: 'two blocking findings',
    });
  });

  it('waitingOn opens a stage without closing it', async () => {
    const { tracker, runs } = build();

    await tracker.waitingOn('run-1', 'approval');

    expect(runs.startStep).toHaveBeenCalledWith('run-1', 'approval');
    expect(runs.finishStep).not.toHaveBeenCalled();
  });

  it('does nothing at all without a run', async () => {
    const { tracker, runs } = build();

    await tracker.succeed(null, 'copy');
    await tracker.fail(null, 'copy', 'x');
    await tracker.skip(null, 'copy');
    await tracker.waitingOn(null, 'copy');

    expect(runs.finishStep).not.toHaveBeenCalled();
    expect(runs.startStep).not.toHaveBeenCalled();
  });
});

describe('finish', () => {
  it('closes the run', async () => {
    const { tracker, runs } = build();

    await tracker.finish('run-1', { status: 'succeeded', draftId: 'draft-1' });

    expect(runs.finish).toHaveBeenCalledWith('run-1', { status: 'succeeded', draftId: 'draft-1' });
    expect(runs.abandonUnfinishedSteps).not.toHaveBeenCalled();
  });

  it('abandons stages that never got their turn when the run failed', async () => {
    const { tracker, runs } = build();

    await tracker.finish('run-1', { status: 'failed', errorMessage: 'render down' });

    expect(runs.abandonUnfinishedSteps).toHaveBeenCalledWith('run-1');
    expect(runs.finish).toHaveBeenCalled();
  });

  it('does nothing without a run', async () => {
    const { tracker, runs } = build();

    await tracker.finish(null, { status: 'succeeded' });

    expect(runs.finish).not.toHaveBeenCalled();
  });

  it('swallows a write failure rather than masking the real outcome', async () => {
    const { tracker, runs } = build();
    runs.finish.mockRejectedValueOnce(new Error('db down') as never);

    await expect(tracker.finish('run-1', { status: 'succeeded' })).resolves.toBeUndefined();
  });
});
