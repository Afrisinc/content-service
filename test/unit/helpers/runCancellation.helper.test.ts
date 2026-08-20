import {
  cancelRun,
  isRunCancellable,
  registerRun,
  releaseRun,
  resetRunCancellations,
} from '@/helpers/runCancellation.helper';
import { afterEach, describe, expect, it } from 'vitest';

afterEach(() => {
  resetRunCancellations();
});

describe('registerRun', () => {
  it('hands back a signal that is not yet aborted', () => {
    const signal = registerRun('run-1');

    expect(signal.aborted).toBe(false);
    expect(isRunCancellable('run-1')).toBe(true);
  });

  it('stops an earlier attempt when the same run registers again', () => {
    // A resume re-enters the same run id; the abandoned attempt must not keep
    // holding a live model call.
    const first = registerRun('run-1');
    const second = registerRun('run-1');

    expect(first.aborted).toBe(true);
    expect(second.aborted).toBe(false);
  });

  it('keeps runs apart', () => {
    const first = registerRun('run-1');
    registerRun('run-2');

    cancelRun('run-2');

    expect(first.aborted).toBe(false);
  });
});

describe('cancelRun', () => {
  it('aborts the signal the work is watching', () => {
    const signal = registerRun('run-1');

    expect(cancelRun('run-1')).toBe(true);
    expect(signal.aborted).toBe(true);
  });

  it('reports false for a run this process is not executing', () => {
    // Which is how the caller knows to say "running elsewhere" rather than
    // claiming it stopped something.
    expect(cancelRun('run-elsewhere')).toBe(false);
  });

  it('is not cancellable twice', () => {
    registerRun('run-1');

    expect(cancelRun('run-1')).toBe(true);
    expect(cancelRun('run-1')).toBe(false);
    expect(isRunCancellable('run-1')).toBe(false);
  });
});

describe('releaseRun', () => {
  it('drops the run without aborting it, so a finished pass leaves nothing behind', () => {
    const signal = registerRun('run-1');

    releaseRun('run-1');

    expect(signal.aborted).toBe(false);
    expect(isRunCancellable('run-1')).toBe(false);
  });

  it('is safe for a run that was never registered', () => {
    expect(() => releaseRun('run-unknown')).not.toThrow();
  });
});
