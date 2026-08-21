import { registerRun, resetRunCancellations } from '@/helpers/runCancellation.helper';
import { AutomationService } from '@/services/automation.service';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    name: 'AFRISINC',
    topics: ['Software development', 'Design systems'],
    postsPerRun: 1,
    defaultFormat: 'post',
    serviceLine: 'Engineering',
    audience: 'Founders',
    ...overrides,
  };
}

function build(overrides: { policy?: Record<string, unknown> | null; groups?: unknown[] } = {}) {
  const policies = {
    findByUser: vi.fn(async () => (overrides.policy === undefined ? null : overrides.policy)),
    upsert: vi.fn(async (_userId: string, data: Record<string, unknown>) => ({
      mode: 'manual',
      autoPublish: true,
      defaultGroupId: null,
      maxPostsPerDay: 3,
      pausedUntil: null,
      lastRunAt: null,
      ...data,
    })),
    touchLastRun: vi.fn(async () => ({ count: 1 })),
    findRunnableUserIds: vi.fn(async () => ['user-1']),
  };

  const groups = {
    findAutopilotGroups: vi.fn(async () => overrides.groups ?? [groupRow()]),
    findActiveTargets: vi.fn(async () => [
      { accountId: 'acc-1', platform: 'instagram', pageId: 'page-1', pageName: 'IG' },
      { accountId: 'acc-2', platform: 'facebook', pageId: 'page-2', pageName: 'FB' },
    ]),
    findByIdForUser: vi.fn(async () => groupRow()),
    countAutopilotGroupsForUser: vi.fn(async () => 1),
    countActiveAccountsForUser: vi.fn(async () => 2),
  };

  const runs = {
    start: vi.fn(async () => ({ id: 'run-1' })),
    findActiveForUser: vi.fn(async () => null),
    findByIdForUser: vi.fn(async () => null),
    findStale: vi.fn(async () => []),
    failRuns: vi.fn(async () => ({ count: 0 })),
    finish: vi.fn(async () => ({ id: 'run-1' })),
    list: vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20 })),
    countSince: vi.fn(async () => 0),
    countForGroupSince: vi.fn(async () => 0),
    findRecentTopics: vi.fn(async () => []),
    summariseForUser: vi.fn(async () => ({ succeeded: 2 })),
  };

  const postAgent = {
    createFromBrief: vi.fn(async () => ({
      id: 'draft-1',
      status: 'awaiting_approval',
      socialPostIds: ['post-1', 'post-2'],
    })),
    approve: vi.fn(async () => ({
      id: 'draft-1',
      status: 'scheduled',
      socialPostIds: ['post-1', 'post-2'],
    })),
  };

  const tracker = { finish: vi.fn(async () => undefined) };

  const service = new AutomationService(
    policies as never,
    groups as never,
    runs as never,
    postAgent as never,
    tracker as never
  );

  return { service, policies, groups, runs, postAgent, tracker };
}

beforeEach(() => {
  vi.clearAllMocks();
  resetRunCancellations();
});

describe('getPolicy', () => {
  it('reports manual for a workspace that never touched the switch', async () => {
    const { service } = build();

    const policy = await service.getPolicy('user-1');

    expect(policy.mode).toBe('manual');
    expect(policy.autoPublish).toBe(true);
    expect(policy.autopilotGroupCount).toBe(1);
    expect(policy.activeAccountCount).toBe(2);
  });

  it('serialises the stored timestamps as ISO strings', async () => {
    const { service } = build({
      policy: {
        mode: 'autopilot',
        autoPublish: true,
        defaultGroupId: 'group-1',
        maxPostsPerDay: 5,
        pausedUntil: new Date('2026-09-01T00:00:00.000Z'),
        lastRunAt: new Date('2026-08-20T06:00:00.000Z'),
      },
    });

    const policy = await service.getPolicy('user-1');

    expect(policy.pausedUntil).toBe('2026-09-01T00:00:00.000Z');
    expect(policy.lastRunAt).toBe('2026-08-20T06:00:00.000Z');
  });
});

describe('updatePolicy', () => {
  it('switches the workspace to autopilot', async () => {
    const { service, policies } = build();

    const policy = await service.updatePolicy('user-1', { mode: 'autopilot' });

    expect(policies.upsert).toHaveBeenCalledWith('user-1', { mode: 'autopilot' });
    expect(policy.mode).toBe('autopilot');
  });

  it('accepts clearing the default group', async () => {
    const { service, policies } = build();

    await service.updatePolicy('user-1', { defaultGroupId: null });

    expect(policies.upsert).toHaveBeenCalledWith('user-1', { defaultGroupId: null });
  });

  it('accepts unpausing', async () => {
    const { service, policies } = build();

    await service.updatePolicy('user-1', { pausedUntil: null });

    expect(policies.upsert).toHaveBeenCalledWith('user-1', { pausedUntil: null });
  });

  it('404s on a default group the caller does not own', async () => {
    const { service, groups, policies } = build();
    groups.findByIdForUser.mockResolvedValueOnce(null as never);

    await expect(service.updatePolicy('user-1', { defaultGroupId: 'gone' })).rejects.toThrow(
      NotFoundError
    );
    expect(policies.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unparseable pause timestamp', async () => {
    const { service, policies } = build();

    await expect(service.updatePolicy('user-1', { pausedUntil: 'never' })).rejects.toThrow(
      BadRequestError
    );
    expect(policies.upsert).not.toHaveBeenCalled();
  });
});

describe('runForUser', () => {
  it('drafts and signs off a post for each autopilot group', async () => {
    const { service, postAgent, runs } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(1);
    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'Software development',
        groupId: 'group-1',
        autoPublish: true,
        userId: 'user-1',
      })
    );
    expect(postAgent.approve).toHaveBeenCalledWith('draft-1', 'autopilot');
    expect(runs.finish).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'succeeded', accountsTargeted: 2 })
    );
  });

  it('leaves the draft for a human when auto-publish is off', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: false, maxPostsPerDay: 3 },
    });

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ autoPublish: false })
    );
    expect(postAgent.approve).not.toHaveBeenCalled();
  });

  it('skips a group with no topics rather than inventing one', async () => {
    const { service, postAgent } = build({ groups: [groupRow({ topics: [] })] });

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(0);
    expect(summary.groups[0].skipped).toBe('no topics configured for this group');
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('skips a group whose accounts are all switched off', async () => {
    const { service, groups, postAgent } = build();
    groups.findActiveTargets.mockResolvedValueOnce([] as never);

    const summary = await service.runForUser('user-1');

    expect(summary.groups[0].skipped).toBe('no switched-on accounts in this group');
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('stops once the workspace hits its daily limit', async () => {
    const { service, runs, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 2 },
    });
    runs.countSince.mockResolvedValueOnce(2 as never);

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(0);
    expect(summary.groups[0].skipped).toBe('daily post limit reached');
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('does not run a group twice on the same day from the cron', async () => {
    const { service, runs, postAgent } = build();
    runs.countForGroupSince.mockResolvedValueOnce(1 as never);

    const summary = await service.runForUser('user-1', 'autopilot');

    expect(summary.groups[0].skipped).toBe('already ran today');
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('lets a hand-triggered run go again the same day', async () => {
    const { service, runs, postAgent } = build();
    runs.countForGroupSince.mockResolvedValueOnce(1 as never);

    await service.runForUser('user-1', 'manual');

    expect(runs.countForGroupSince).not.toHaveBeenCalled();
    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('picks a topic the group has not covered lately', async () => {
    const { service, runs, postAgent } = build();
    runs.findRecentTopics.mockResolvedValueOnce(['Software development'] as never);

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Design systems' })
    );
  });

  it('rotates to the stalest topic once every one has been covered', async () => {
    const { service, runs, postAgent } = build();
    // Newest first: "Software development" ran most recently, so the other is due.
    runs.findRecentTopics.mockResolvedValueOnce([
      'Software development',
      'Design systems',
    ] as never);

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Design systems' })
    );
  });

  it('records the failure and stops the group when the agent throws', async () => {
    const { service, postAgent, runs } = build({ groups: [groupRow({ postsPerRun: 3 })] });
    postAgent.createFromBrief.mockRejectedValueOnce(new Error('render down') as never);

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(0);
    expect(summary.groups[0].failed).toBe('render down');
    expect(runs.finish).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed', errorMessage: 'render down' })
    );
    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('marks the run failed when the craft audit blocks the sign-off', async () => {
    const { service, postAgent, runs } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });
    postAgent.approve.mockRejectedValueOnce(new Error('the craft audit has not passed') as never);

    const summary = await service.runForUser('user-1');

    expect(summary.groups[0].failed).toBe('the craft audit has not passed');
    expect(runs.finish).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('does not stamp a last-run time when nothing was drafted', async () => {
    const { service, policies, groups } = build();
    groups.findAutopilotGroups.mockResolvedValueOnce([] as never);

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(0);
    expect(policies.touchLastRun).not.toHaveBeenCalled();
  });

  it('stamps a last-run time once something was drafted', async () => {
    const { service, policies } = build();

    await service.runForUser('user-1');

    expect(policies.touchLastRun).toHaveBeenCalledWith('user-1');
  });

  it('honours postsPerRun within the daily budget', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow({ postsPerRun: 2 })],
    });

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(2);
    expect(postAgent.createFromBrief).toHaveBeenCalledTimes(2);
  });

  it('clamps postsPerRun to what the daily budget still allows', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
      groups: [groupRow({ postsPerRun: 5 })],
    });

    const summary = await service.runForUser('user-1');

    expect(summary.drafted).toBe(3);
    expect(postAgent.createFromBrief).toHaveBeenCalledTimes(3);
  });

  it('falls back to a feed post when the group names an unknown format', async () => {
    const { service, postAgent } = build({ groups: [groupRow({ defaultFormat: 'billboard' })] });

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ format: 'post' })
    );
  });
});

describe('runDueUsers', () => {
  it('runs every workspace whose switch is set to autopilot', async () => {
    const { service, policies, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });

    const result = await service.runDueUsers();

    expect(policies.findRunnableUserIds).toHaveBeenCalled();
    expect(result).toEqual({ users: 1, drafted: 1 });
    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('keeps going when one workspace blows up', async () => {
    const { service, policies, groups } = build();
    policies.findRunnableUserIds.mockResolvedValueOnce(['user-1', 'user-2'] as never);
    groups.findAutopilotGroups.mockRejectedValueOnce(new Error('db down') as never);

    const result = await service.runDueUsers();

    expect(result.users).toBe(2);
    expect(result.drafted).toBe(1);
  });
});

describe('listRuns', () => {
  it('serialises a run into a reportable shape', async () => {
    const { service, runs } = build();
    runs.list.mockResolvedValueOnce({
      items: [
        {
          id: 'run-1',
          groupId: 'group-1',
          group: { id: 'group-1', name: 'AFRISINC' },
          agent: 'post-agent',
          trigger: 'autopilot',
          status: 'succeeded',
          topic: 'Software development',
          draftId: 'draft-1',
          postIds: ['post-1'],
          accountsTargeted: 2,
          errorMessage: null,
          startedAt: new Date('2026-08-20T06:00:00.000Z'),
          finishedAt: new Date('2026-08-20T06:04:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(result.items[0]).toMatchObject({
      groupName: 'AFRISINC',
      durationMs: 240_000,
      startedAt: '2026-08-20T06:00:00.000Z',
    });
  });

  it('leaves the duration open while a run is still going', async () => {
    const { service, runs } = build();
    runs.list.mockResolvedValueOnce({
      items: [
        {
          id: 'run-1',
          groupId: null,
          group: null,
          agent: 'post-agent',
          trigger: 'manual',
          status: 'running',
          topic: null,
          draftId: null,
          postIds: [],
          accountsTargeted: 0,
          errorMessage: null,
          startedAt: new Date('2026-08-20T06:00:00.000Z'),
          finishedAt: null,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(result.items[0].durationMs).toBeNull();
    expect(result.items[0].groupName).toBeNull();
  });
});

describe('summarise', () => {
  it('reports today’s run counts by status', async () => {
    const { service, runs } = build();

    await expect(service.summarise('user-1')).resolves.toEqual({ succeeded: 2 });
    expect(runs.summariseForUser).toHaveBeenCalled();
  });
});

describe('getRun', () => {
  it('returns the run with its stages and per-stage timings', async () => {
    const { service, runs } = build();
    const withSteps = {
      id: 'run-1',
      groupId: 'group-1',
      group: { id: 'group-1', name: 'AFRISINC' },
      agent: 'post-agent',
      trigger: 'autopilot',
      status: 'running',
      topic: 'Software development',
      draftId: 'draft-1',
      postIds: [],
      accountsTargeted: 2,
      errorMessage: null,
      startedAt: new Date('2026-08-20T06:00:00.000Z'),
      finishedAt: null,
      steps: [
        {
          key: 'copy',
          label: 'Write',
          sequence: 1,
          status: 'succeeded',
          detail: '5 frames · 1 attempt',
          errorMessage: null,
          startedAt: new Date('2026-08-20T06:00:01.000Z'),
          finishedAt: new Date('2026-08-20T06:00:31.000Z'),
        },
        {
          key: 'render',
          label: 'Render',
          sequence: 3,
          status: 'running',
          detail: null,
          errorMessage: null,
          startedAt: new Date('2026-08-20T06:00:31.000Z'),
          finishedAt: null,
        },
      ],
    };
    (runs as unknown as { findByIdForUser: unknown }).findByIdForUser = vi.fn(
      async () => withSteps
    );

    const run = await service.getRun('user-1', 'run-1');

    expect(run.steps).toHaveLength(2);
    expect(run.steps[0]).toMatchObject({ key: 'copy', durationMs: 30_000 });
    // A stage still going has no duration to report yet.
    expect(run.steps[1]).toMatchObject({ key: 'render', status: 'running', durationMs: null });
    expect(run.durationMs).toBeNull();
  });

  it('404s on a run belonging to someone else', async () => {
    const { service, runs } = build();
    (runs as unknown as { findByIdForUser: unknown }).findByIdForUser = vi.fn(async () => null);

    await expect(service.getRun('user-1', 'run-9')).rejects.toThrow(NotFoundError);
  });
});

describe('listRuns with stages', () => {
  it('reports an empty stage list rather than undefined for an old run', async () => {
    const { service, runs } = build();
    runs.list.mockResolvedValueOnce({
      items: [
        {
          id: 'run-1',
          groupId: null,
          group: null,
          agent: 'post-agent',
          trigger: 'manual',
          status: 'succeeded',
          topic: null,
          draftId: null,
          postIds: [],
          accountsTargeted: 0,
          errorMessage: null,
          startedAt: new Date('2026-08-20T06:00:00.000Z'),
          finishedAt: new Date('2026-08-20T06:01:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(result.items[0].steps).toEqual([]);
  });
});

describe('requestRun', () => {
  /** The work is detached, so let the microtask queue drain before asserting. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it('accepts and returns without waiting for the agents to finish', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });

    const outcome = await service.requestRun('user-1');

    expect(outcome).toMatchObject({
      accepted: true,
      alreadyRunning: false,
      activeRunId: null,
      reason: null,
    });
    // The whole point: the caller is already free while the pass is still
    // getting started, so a request is never held open for a minute of drafting.
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();

    await settle();
    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('refuses a second trigger while one is already going', async () => {
    const { service, runs, postAgent } = build();
    runs.findActiveForUser.mockResolvedValueOnce({
      id: 'run-9',
      startedAt: new Date(),
      topic: 'Software development',
    } as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome).toMatchObject({
      accepted: false,
      alreadyRunning: true,
      activeRunId: 'run-9',
    });
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('says so rather than starting nothing when no brand has its agents on', async () => {
    const { service, groups, postAgent } = build();
    groups.findAutopilotGroups.mockResolvedValueOnce([] as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome).toMatchObject({
      accepted: false,
      alreadyRunning: false,
      reason: 'no brand has its agents switched on',
    });
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('still runs the pass in the background after returning', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });

    await service.requestRun('user-1');
    await settle();

    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('does not let a detached failure escape as an unhandled rejection', async () => {
    const { service, groups } = build();
    // findAutopilotGroups is called twice: once for the guard, once in the pass.
    groups.findAutopilotGroups
      .mockResolvedValueOnce([groupRow()] as never)
      .mockRejectedValueOnce(new Error('db down') as never);

    await expect(service.requestRun('user-1')).resolves.toMatchObject({ accepted: true });
    await settle();
  });
});

describe('reconcileInterruptedRuns', () => {
  it('closes out runs whose process died mid-flight', async () => {
    const { service, runs } = build();
    runs.findStale.mockResolvedValueOnce([{ id: 'run-1' }, { id: 'run-2' }] as never);

    await expect(service.reconcileInterruptedRuns(30)).resolves.toBe(2);

    expect(runs.failRuns).toHaveBeenCalledWith(
      ['run-1', 'run-2'],
      'the run was interrupted and did not finish'
    );
  });

  it('uses the cutoff it was handed', async () => {
    const { service, runs } = build();

    await service.reconcileInterruptedRuns(10);

    const cutoff = runs.findStale.mock.calls[0][0] as unknown as Date;
    const minutesAgo = (Date.now() - cutoff.getTime()) / 60_000;
    expect(minutesAgo).toBeGreaterThan(9);
    expect(minutesAgo).toBeLessThan(11);
  });

  it('touches nothing when every run finished properly', async () => {
    const { service, runs } = build();

    await expect(service.reconcileInterruptedRuns(30)).resolves.toBe(0);
    expect(runs.failRuns).not.toHaveBeenCalled();
  });
});

describe('getActiveRun', () => {
  it('returns null when the workspace is idle', async () => {
    const { service } = build();

    await expect(service.getActiveRun('user-1')).resolves.toBeNull();
  });

  it('returns the run in flight so a reopened page resumes onto it', async () => {
    const { service, runs } = build();
    runs.findActiveForUser.mockResolvedValueOnce({
      id: 'run-1',
      startedAt: new Date(),
      topic: 'Software development',
    } as never);
    runs.findByIdForUser.mockResolvedValueOnce({
      id: 'run-1',
      groupId: null,
      group: null,
      agent: 'post-agent',
      trigger: 'manual',
      status: 'running',
      topic: 'Software development',
      draftId: null,
      postIds: [],
      accountsTargeted: 0,
      errorMessage: null,
      startedAt: new Date('2026-08-20T06:00:00.000Z'),
      finishedAt: null,
      steps: [],
    } as never);

    const run = await service.getActiveRun('user-1');

    expect(run).toMatchObject({ id: 'run-1', status: 'running' });
  });
});

describe('requestResume', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  function failedRun(overrides: Record<string, unknown> = {}) {
    return {
      id: 'run-1',
      userId: 'user-1',
      draftId: 'draft-1',
      status: 'failed',
      groupId: 'group-1',
      ...overrides,
    };
  }

  function withResume(build_: ReturnType<typeof build>) {
    const runs = build_.runs as unknown as Record<string, unknown>;
    runs.findById = vi.fn(async () => failedRun());
    runs.reopenRun = vi.fn(async () => ({ id: 'run-1' }));
    const postAgent = build_.postAgent as unknown as Record<string, unknown>;
    postAgent.isResumable = vi.fn(async () => true);
    postAgent.resume = vi.fn(async () => ({ id: 'draft-1', socialPostIds: [] }));
    return build_;
  }

  it('reopens the run and picks it up in the background', async () => {
    const harness = withResume(build());
    const { service, runs, postAgent } = harness;

    // A resume that never settles: the caller must still be freed immediately.
    let release: (() => void) | undefined;
    (postAgent as unknown as Record<string, unknown>).resume = vi.fn(
      () =>
        new Promise(resolve => {
          release = () => resolve({ id: 'draft-1', socialPostIds: [] });
        })
    );

    const outcome = await service.requestResume('user-1', 'run-1');

    expect(outcome).toMatchObject({ accepted: true, activeRunId: 'run-1' });
    expect(runs.reopenRun).toHaveBeenCalledWith('run-1');
    expect(postAgent.resume).toHaveBeenCalledWith('run-1');
    // Still mid-flight when the caller got its answer — that is the point.
    expect(release).toBeDefined();

    release?.();
    await settle();
  });

  it('404s on a run belonging to someone else', async () => {
    const harness = withResume(build());
    (harness.runs as unknown as Record<string, unknown>).findById = vi.fn(async () =>
      failedRun({ userId: 'someone-else' })
    );

    await expect(harness.service.requestResume('user-1', 'run-1')).rejects.toThrow(NotFoundError);
  });

  it('404s on a run that does not exist', async () => {
    const harness = withResume(build());
    (harness.runs as unknown as Record<string, unknown>).findById = vi.fn(async () => null);

    await expect(harness.service.requestResume('user-1', 'run-9')).rejects.toThrow(NotFoundError);
  });

  it('refuses to resume a run that succeeded', async () => {
    const harness = withResume(build());
    (harness.runs as unknown as Record<string, unknown>).findById = vi.fn(async () =>
      failedRun({ status: 'succeeded' })
    );

    await expect(harness.service.requestResume('user-1', 'run-1')).rejects.toThrow(ConflictError);
    expect(harness.runs.reopenRun).not.toHaveBeenCalled();
  });

  it('reports a run that is already going rather than starting it twice', async () => {
    const harness = withResume(build());
    (harness.runs as unknown as Record<string, unknown>).findById = vi.fn(async () =>
      failedRun({ status: 'running' })
    );

    const outcome = await harness.service.requestResume('user-1', 'run-1');

    expect(outcome).toMatchObject({ accepted: false, alreadyRunning: true });
    expect(harness.postAgent.resume).not.toHaveBeenCalled();
  });

  it('will not start a resume while another run is in flight', async () => {
    const harness = withResume(build());
    harness.runs.findActiveForUser.mockResolvedValueOnce({
      id: 'run-other',
      startedAt: new Date(),
      topic: 'x',
    } as never);

    const outcome = await harness.service.requestResume('user-1', 'run-1');

    expect(outcome).toMatchObject({
      accepted: false,
      alreadyRunning: true,
      activeRunId: 'run-other',
    });
    expect(harness.runs.reopenRun).not.toHaveBeenCalled();
  });

  it('says so plainly when the working state has expired', async () => {
    const harness = withResume(build());
    (harness.postAgent as unknown as Record<string, unknown>).isResumable = vi.fn(
      async () => false
    );

    await expect(harness.service.requestResume('user-1', 'run-1')).rejects.toThrow(
      /working state for this run has expired/
    );
    expect(harness.runs.reopenRun).not.toHaveBeenCalled();
  });

  it('abandons unfinished stages when the resumed pass throws again', async () => {
    const harness = withResume(build());
    (harness.postAgent as unknown as Record<string, unknown>).resume = vi.fn(async () => {
      throw new Error('render still down');
    });

    await harness.service.requestResume('user-1', 'run-1');
    await settle();

    expect(harness.tracker.finish).toHaveBeenCalledWith('run-1', {
      status: 'failed',
      errorMessage: 'render still down',
    });
  });
});

describe('listRuns with stages', () => {
  it('reports an empty stage list rather than undefined for an old run', async () => {
    const { service, runs } = build();
    runs.list.mockResolvedValueOnce({
      items: [
        {
          id: 'run-1',
          groupId: null,
          group: null,
          agent: 'post-agent',
          trigger: 'manual',
          status: 'succeeded',
          topic: null,
          draftId: null,
          postIds: [],
          accountsTargeted: 0,
          errorMessage: null,
          startedAt: new Date('2026-08-20T06:00:00.000Z'),
          finishedAt: new Date('2026-08-20T06:01:00.000Z'),
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(result.items[0].steps).toEqual([]);
  });
});

describe('requestRun', () => {
  /** The work is detached, so let the microtask queue drain before asserting. */
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it('accepts and returns without waiting for the agents to finish', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });

    const outcome = await service.requestRun('user-1');

    expect(outcome).toMatchObject({
      accepted: true,
      alreadyRunning: false,
      activeRunId: null,
      reason: null,
    });
    // The whole point: the caller is already free while the pass is still
    // getting started, so a request is never held open for a minute of drafting.
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();

    await settle();
    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('refuses a second trigger while one is already going', async () => {
    const { service, runs, postAgent } = build();
    runs.findActiveForUser.mockResolvedValueOnce({
      id: 'run-9',
      startedAt: new Date(),
      topic: 'Software development',
    } as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome).toMatchObject({
      accepted: false,
      alreadyRunning: true,
      activeRunId: 'run-9',
    });
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('says so rather than starting nothing when no brand has its agents on', async () => {
    const { service, groups, postAgent } = build();
    groups.findAutopilotGroups.mockResolvedValueOnce([] as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome).toMatchObject({
      accepted: false,
      alreadyRunning: false,
      reason: 'no brand has its agents switched on',
    });
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('still runs the pass in the background after returning', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 3 },
    });

    await service.requestRun('user-1');
    await settle();

    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
  });

  it('does not let a detached failure escape as an unhandled rejection', async () => {
    const { service, groups } = build();
    // findAutopilotGroups is called twice: once for the guard, once in the pass.
    groups.findAutopilotGroups
      .mockResolvedValueOnce([groupRow()] as never)
      .mockRejectedValueOnce(new Error('db down') as never);

    await expect(service.requestRun('user-1')).resolves.toMatchObject({ accepted: true });
    await settle();
  });
});

describe('reconcileInterruptedRuns', () => {
  it('closes out runs whose process died mid-flight', async () => {
    const { service, runs } = build();
    runs.findStale.mockResolvedValueOnce([{ id: 'run-1' }, { id: 'run-2' }] as never);

    await expect(service.reconcileInterruptedRuns(30)).resolves.toBe(2);

    expect(runs.failRuns).toHaveBeenCalledWith(
      ['run-1', 'run-2'],
      'the run was interrupted and did not finish'
    );
  });

  it('uses the cutoff it was handed', async () => {
    const { service, runs } = build();

    await service.reconcileInterruptedRuns(10);

    const cutoff = runs.findStale.mock.calls[0][0] as unknown as Date;
    const minutesAgo = (Date.now() - cutoff.getTime()) / 60_000;
    expect(minutesAgo).toBeGreaterThan(9);
    expect(minutesAgo).toBeLessThan(11);
  });

  it('touches nothing when every run finished properly', async () => {
    const { service, runs } = build();

    await expect(service.reconcileInterruptedRuns(30)).resolves.toBe(0);
    expect(runs.failRuns).not.toHaveBeenCalled();
  });
});

describe('getActiveRun', () => {
  it('returns null when the workspace is idle', async () => {
    const { service } = build();

    await expect(service.getActiveRun('user-1')).resolves.toBeNull();
  });

  it('returns the run in flight so a reopened page resumes onto it', async () => {
    const { service, runs } = build();
    runs.findActiveForUser.mockResolvedValueOnce({
      id: 'run-1',
      startedAt: new Date(),
      topic: 'Software development',
    } as never);
    runs.findByIdForUser.mockResolvedValueOnce({
      id: 'run-1',
      groupId: null,
      group: null,
      agent: 'post-agent',
      trigger: 'manual',
      status: 'running',
      topic: 'Software development',
      draftId: null,
      postIds: [],
      accountsTargeted: 0,
      errorMessage: null,
      startedAt: new Date('2026-08-20T06:00:00.000Z'),
      finishedAt: null,
      steps: [],
    } as never);

    const run = await service.getActiveRun('user-1');

    expect(run).toMatchObject({ id: 'run-1', status: 'running' });
  });
});

describe('resumable flag', () => {
  function runRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'run-1',
      groupId: null,
      group: null,
      agent: 'post-agent',
      trigger: 'manual',
      status: 'succeeded',
      topic: null,
      draftId: null,
      postIds: [],
      accountsTargeted: 0,
      errorMessage: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      steps: [],
      ...overrides,
    };
  }

  it('is only checked for failed runs, so a clean page costs no cache reads', async () => {
    const { service, runs, postAgent } = build();
    const isResumable = vi.fn(async () => true);
    (postAgent as unknown as Record<string, unknown>).isResumable = isResumable;
    runs.list.mockResolvedValueOnce({
      items: [runRow()],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(isResumable).not.toHaveBeenCalled();
    expect(result.items[0].resumable).toBe(false);
  });

  it('is reported for a failed run that still has its state', async () => {
    const { service, runs, postAgent } = build();
    (postAgent as unknown as Record<string, unknown>).isResumable = vi.fn(async () => true);
    runs.list.mockResolvedValueOnce({
      items: [
        runRow({
          status: 'failed',
          topic: 'board level laptop repair for schools',
          errorMessage: 'no approved photograph is available',
        }),
      ],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(result.items[0].resumable).toBe(true);
  });

  it('is false once the working state has expired', async () => {
    const { service, runs, postAgent } = build();
    (postAgent as unknown as Record<string, unknown>).isResumable = vi.fn(async () => false);
    runs.list.mockResolvedValueOnce({
      items: [runRow({ status: 'failed' })],
      total: 1,
      page: 1,
      limit: 20,
    } as never);

    const result = await service.listRuns({ userId: 'user-1' });

    expect(result.items[0].resumable).toBe(false);
  });
});

describe('cancel', () => {
  function runningRun(overrides: Record<string, unknown> = {}) {
    return {
      id: 'run-1',
      userId: 'user-1',
      draftId: null,
      status: 'running',
      groupId: null,
      ...overrides,
    };
  }

  it('stops a run executing in this instance and frees the slot', async () => {
    const { service, runs, tracker } = build();
    (runs as unknown as Record<string, unknown>).findById = vi.fn(async () => runningRun());
    registerRun('run-1');

    const outcome = await service.cancel('user-1', 'run-1');

    expect(outcome.cancelled).toBe(true);
    expect(tracker.finish).toHaveBeenCalledWith('run-1', {
      status: 'failed',
      errorMessage: 'stopped by hand',
    });
  });

  it('still frees the slot when the pass is running in another instance', async () => {
    const { service, runs, tracker } = build();
    (runs as unknown as Record<string, unknown>).findById = vi.fn(async () => runningRun());

    const outcome = await service.cancel('user-1', 'run-1');

    // Honest: the row is closed so the workspace is usable, but the remote pass
    // is not claimed to have stopped.
    expect(outcome.cancelled).toBe(false);
    expect(tracker.finish).toHaveBeenCalledWith('run-1', {
      status: 'failed',
      errorMessage: expect.stringContaining('running elsewhere'),
    });
  });

  it('refuses to cancel a run that already finished', async () => {
    const { service, runs, tracker } = build();
    (runs as unknown as Record<string, unknown>).findById = vi.fn(async () =>
      runningRun({ status: 'succeeded' })
    );

    await expect(service.cancel('user-1', 'run-1')).rejects.toThrow(ConflictError);
    expect(tracker.finish).not.toHaveBeenCalled();
  });

  it('404s on someone else’s run', async () => {
    const { service, runs } = build();
    (runs as unknown as Record<string, unknown>).findById = vi.fn(async () =>
      runningRun({ userId: 'someone-else' })
    );

    await expect(service.cancel('user-1', 'run-1')).rejects.toThrow(NotFoundError);
  });
});

describe('the daily cap', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  /**
   * The bug this prevents: the pass is accepted, skips every brand on the
   * budget, creates no run row at all — and the caller is told the agents are
   * running while the UI shows nothing new.
   */
  it('refuses a trigger when today’s limit is already spent', async () => {
    const { service, runs, postAgent } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 1 },
    });
    runs.countSince.mockResolvedValue(2 as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toMatch(/today's limit of 1 post is already used/);
    await settle();
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('names the cap in the plural when it is more than one', async () => {
    const { service, runs } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 3 },
    });
    runs.countSince.mockResolvedValue(3 as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome.reason).toMatch(/today's limit of 3 posts is already used/);
  });

  it('accepts while the budget still has room', async () => {
    const { service, runs } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 3 },
    });
    runs.countSince.mockResolvedValue(2 as never);

    await expect(service.requestRun('user-1')).resolves.toMatchObject({ accepted: true });
    await settle();
  });

  it('uses the default cap for a workspace that never set one', async () => {
    const { service, runs } = build();
    runs.countSince.mockResolvedValue(3 as never);

    const outcome = await service.requestRun('user-1');

    expect(outcome.accepted).toBe(false);
    expect(outcome.reason).toMatch(/today's limit of 3 posts/);
  });
});

describe('topic rotation', () => {
  it('covers a topic that has never run before anything else', async () => {
    const { service, runs, postAgent } = build();
    runs.findRecentTopics.mockResolvedValueOnce(['Software development'] as never);

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Design systems' })
    );
  });

  /**
   * The bug this replaces: once history covered every topic, the old rule fell
   * back to `topics[0]` and posted the same subject for ever.
   */
  it('keeps rotating once every topic has been covered', async () => {
    const { service, runs, postAgent } = build();
    // Newest first, so "Design systems" ran most recently.
    runs.findRecentTopics.mockResolvedValueOnce([
      'Design systems',
      'Software development',
    ] as never);

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Software development' })
    );
  });

  it('picks the stalest topic, not merely one that is absent from the head', async () => {
    const { service, runs, postAgent } = build({
      groups: [groupRow({ topics: ['A', 'B', 'C'] })],
    });
    runs.findRecentTopics.mockResolvedValueOnce(['B', 'A', 'C'] as never);

    await service.runForUser('user-1');

    // C is furthest back in the history, so it is the one due.
    expect(postAgent.createFromBrief).toHaveBeenCalledWith(expect.objectContaining({ topic: 'C' }));
  });

  it('never repeats a topic inside one batch', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow({ postsPerRun: 2 })],
    });

    await service.runForUser('user-1');

    const topics = postAgent.createFromBrief.mock.calls.map(
      call => (call[0] as { topic: string }).topic
    );
    expect(new Set(topics).size).toBe(2);
  });

  it('reuses a topic only when the batch outruns the list', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'autopilot', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow({ topics: ['Only one'], postsPerRun: 3 })],
    });

    await service.runForUser('user-1');

    const topics = postAgent.createFromBrief.mock.calls.map(
      call => (call[0] as { topic: string }).topic
    );
    expect(topics).toEqual(['Only one', 'Only one', 'Only one']);
  });

  it('is stable when nothing has run at all', async () => {
    const { service, postAgent } = build();

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ topic: 'Software development' })
    );
  });
});

describe('how many posts a trigger will draft', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it('reports the batch size, so three runs from one click is not a surprise', async () => {
    const { service } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow({ postsPerRun: 3 })],
    });

    const outcome = await service.requestRun('user-1');

    expect(outcome.plannedPosts).toBe(3);
    await settle();
  });

  it('sums across every brand that will run', async () => {
    const { service } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow({ postsPerRun: 3 }), groupRow({ id: 'group-2', postsPerRun: 2 })],
    });

    const outcome = await service.requestRun('user-1');

    expect(outcome.plannedPosts).toBe(5);
    await settle();
  });

  it('clamps the batch to what the daily budget still allows', async () => {
    const { service, runs } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 5 },
      groups: [groupRow({ postsPerRun: 3 }), groupRow({ id: 'group-2', postsPerRun: 3 })],
    });
    runs.countSince.mockResolvedValue(3 as never);

    const outcome = await service.requestRun('user-1');

    // Two of five left, so the first brand takes both and the second gets none.
    expect(outcome.plannedPosts).toBe(2);
    await settle();
  });

  it('plans nothing when the trigger was refused', async () => {
    const { service, groups } = build();
    groups.findAutopilotGroups.mockResolvedValueOnce([] as never);

    await expect(service.requestRun('user-1')).resolves.toMatchObject({
      accepted: false,
      plannedPosts: 0,
    });
  });
});

describe('running one brand on its own', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 0));

  it('runs only the brand it was given', async () => {
    const { service, groups, postAgent } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow(), groupRow({ id: 'group-2', name: 'Stories' })],
    });

    await service.requestRun('user-1', 'group-2');
    await settle();

    expect(postAgent.createFromBrief).toHaveBeenCalledOnce();
    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: 'group-2' })
    );
    expect(groups.findByIdForUser).toHaveBeenCalledWith('group-2', 'user-1');
  });

  it('plans only that brand’s batch', async () => {
    const { service } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow({ postsPerRun: 3 }), groupRow({ id: 'group-2', postsPerRun: 1 })],
    });

    const outcome = await service.requestRun('user-1', 'group-2');

    expect(outcome.plannedPosts).toBe(1);
    await settle();
  });

  it('404s on a brand the caller does not own', async () => {
    const { service, groups, postAgent } = build();
    groups.findByIdForUser.mockResolvedValueOnce(null as never);

    await expect(service.requestRun('user-1', 'someone-elses')).rejects.toThrow(NotFoundError);
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('refuses a brand whose agents are switched off, rather than running the others', async () => {
    const { service, postAgent } = build({
      groups: [groupRow(), groupRow({ id: 'group-2' })],
    });

    const outcome = await service.requestRun('user-1', 'group-3');

    expect(outcome).toMatchObject({
      accepted: false,
      reason: 'this brand does not have its agents switched on',
      plannedPosts: 0,
    });
    await settle();
    expect(postAgent.createFromBrief).not.toHaveBeenCalled();
  });

  it('still runs every brand when none is named', async () => {
    const { service, postAgent } = build({
      policy: { mode: 'manual', autoPublish: true, maxPostsPerDay: 10 },
      groups: [groupRow(), groupRow({ id: 'group-2' })],
    });

    await service.requestRun('user-1');
    await settle();

    expect(postAgent.createFromBrief).toHaveBeenCalledTimes(2);
  });
});

describe('frames per post', () => {
  it('passes the brand’s frame count to the copy agent', async () => {
    const { service, postAgent } = build({ groups: [groupRow({ slideCount: 7 })] });

    await service.runForUser('user-1');

    expect(postAgent.createFromBrief).toHaveBeenCalledWith(
      expect.objectContaining({ slideCount: 7 })
    );
  });

  it('leaves the house length to the copy agent when the brand set none', async () => {
    // slideCountFor() already falls back to the preferred length per format, so
    // sending null would override that with nothing useful.
    const { service, postAgent } = build({ groups: [groupRow({ slideCount: null })] });

    await service.runForUser('user-1');

    const brief = postAgent.createFromBrief.mock.calls[0][0] as { slideCount?: number };
    expect(brief.slideCount).toBeUndefined();
  });
});
