import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentRunRecorder } from '@/services/agentRunRecorder.service';

const runs = {
  start: vi.fn(),
  seedSteps: vi.fn(),
  startStep: vi.fn(),
  finishStep: vi.fn(),
  finish: vi.fn(),
  discard: vi.fn(),
};

const input = <T>(execute: () => Promise<T>, outcome: (result: T) => object) => ({
  agent: 'news' as const,
  trigger: 'schedule' as const,
  topic: 'Fetch news feeds',
  stepLabel: 'Fetch feeds',
  execute,
  outcome: outcome as never,
});

describe('AgentRunRecorder', () => {
  const recorder = new AgentRunRecorder(runs as never);

  beforeEach(() => {
    vi.clearAllMocks();
    runs.start.mockResolvedValue({ id: 'run-1' });
  });

  it('opens a workspace run with one live stage, then closes it with the outcome', async () => {
    const result = await recorder.record(
      input(
        async () => 42,
        () => ({ status: 'succeeded', detail: '9 new' })
      )
    );

    expect(result).toBe(42);
    expect(runs.start).toHaveBeenCalledWith({
      userId: 'workspace',
      agent: 'news',
      trigger: 'schedule',
      topic: 'Fetch news feeds',
    });
    expect(runs.seedSteps).toHaveBeenCalledWith('run-1', [
      { key: 'run', label: 'Fetch feeds', sequence: 0 },
    ]);
    expect(runs.startStep).toHaveBeenCalledWith('run-1', 'run');
    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'run', {
      status: 'succeeded',
      detail: '9 new',
    });
    expect(runs.finish).toHaveBeenCalledWith('run-1', { status: 'succeeded' });
  });

  it('records a failed outcome with its error on the stage and the run', async () => {
    await recorder.record(
      input(
        async () => null,
        () => ({ status: 'failed', detail: '', errorMessage: 'Every feed failed' })
      )
    );

    expect(runs.finishStep).toHaveBeenCalledWith('run-1', 'run', {
      status: 'failed',
      errorMessage: 'Every feed failed',
    });
    expect(runs.finish).toHaveBeenCalledWith('run-1', {
      status: 'failed',
      errorMessage: 'Every feed failed',
    });
  });

  it('drops a run whose outcome asks not to be kept', async () => {
    await recorder.record(
      input(
        async () => null,
        () => ({ status: 'skipped', detail: 'Nothing was waiting', keep: false })
      )
    );

    expect(runs.discard).toHaveBeenCalledWith('run-1');
    expect(runs.finish).not.toHaveBeenCalled();
  });

  it('marks the run failed and rethrows when the work throws', async () => {
    const outcome = vi.fn();

    await expect(
      recorder.record(
        input(async () => {
          throw new Error('x'.repeat(1500));
        }, outcome)
      )
    ).rejects.toThrow();

    expect(outcome).not.toHaveBeenCalled();
    const recorded = runs.finish.mock.calls[0][1];
    expect(recorded.status).toBe('failed');
    expect(recorded.errorMessage).toHaveLength(1000);
  });

  it('rethrows a non-Error failure and records it as text', async () => {
    await expect(
      recorder.record(
        input(
          () => Promise.reject('offline'),
          () => ({})
        )
      )
    ).rejects.toBe('offline');

    expect(runs.finish.mock.calls[0][1]).toEqual({ status: 'failed', errorMessage: 'offline' });
  });

  it('still does the work when the run log cannot be opened', async () => {
    runs.start.mockRejectedValue(new Error('db down'));

    await expect(
      recorder.record(
        input(
          async () => 'done',
          () => ({ status: 'succeeded', detail: '' })
        )
      )
    ).resolves.toBe('done');

    expect(runs.finish).not.toHaveBeenCalled();
  });

  it('keeps the result when closing the run fails', async () => {
    runs.finish.mockRejectedValue(new Error('db down'));

    await expect(
      recorder.record(
        input(
          async () => 'done',
          () => ({ status: 'succeeded', detail: 'ok' })
        )
      )
    ).resolves.toBe('done');
  });
});
