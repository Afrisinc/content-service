import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  AUTOPILOT_ENABLED: true,
  NEWS_AGENT_ENABLED: true,
  NEWSLETTER_DIGEST_ENABLED: false,
  ANALYTICS_PULL_ENABLED: true,
  CRON_SCHEDULE_AUTOPILOT: '0 * * * *',
  CRON_SCHEDULE_NEWS_INGEST: '*/30 * * * *',
  CRON_SCHEDULE_NEWS_ENHANCE: '*/10 * * * *',
  CRON_SCHEDULE_NEWSLETTER_DIGEST: '30 6 * * *',
  CRON_SCHEDULE_ANALYTICS_PULL: '20 * * * *',
}));

vi.mock('@/config/env', () => ({ env: envMock }));

const { AgentControlService } = await import('@/services/agentControl.service');

const repository = {
  findByUser: vi.fn(),
  findAgentSnapshots: vi.fn(),
  saveAgentChoices: vi.fn(),
};

const runs = {
  findLatestPerAgent: vi.fn(),
  countByAgentSince: vi.fn(),
};

const lastNewsRun = {
  id: 'run-news',
  agent: 'news',
  status: 'succeeded',
  trigger: 'schedule',
  topic: 'Fetch news feeds',
  errorMessage: null,
  startedAt: new Date('2026-09-24T08:00:00Z'),
  finishedAt: new Date('2026-09-24T08:00:04Z'),
  steps: [{ detail: '118 items read · 9 new' }],
};

const live = (agents: Record<string, boolean> = {}) => ({
  userId: 'u1',
  mode: 'autopilot',
  pausedUntil: null,
  agents,
});

describe('AgentControlService', () => {
  const service = new AgentControlService(repository as never, runs as never);

  beforeEach(() => {
    vi.clearAllMocks();
    runs.findLatestPerAgent.mockResolvedValue([lastNewsRun]);
    runs.countByAgentSince.mockResolvedValue({ news: 5, 'post-agent': 2 });
    repository.findByUser.mockResolvedValue(live({ news: true }));
    repository.findAgentSnapshots.mockResolvedValue([live({ news: true })]);
  });

  it('lists every registered agent with its state and the reason it is not running', async () => {
    const agents = await service.list('u1');

    expect(agents.map(agent => agent.key)).toEqual(['post', 'news', 'newsletter', 'analytics']);
    const byKey = Object.fromEntries(agents.map(agent => [agent.key, agent]));

    expect(byKey.post).toMatchObject({
      scope: 'user',
      enabled: true,
      chosen: false,
      active: true,
      blockedBy: null,
    });
    expect(byKey.news).toMatchObject({
      scope: 'workspace',
      enabled: true,
      chosen: true,
      active: true,
      schedules: [
        { label: 'Fetch feeds', cron: '*/30 * * * *' },
        { label: 'Write & publish', cron: '*/10 * * * *' },
      ],
    });
    expect(byKey.newsletter).toMatchObject({
      allowedByServer: false,
      active: false,
      blockedBy: 'server',
    });
    expect(byKey.analytics).toMatchObject({ requiresAutopilot: false, active: true });
  });

  it('explains an agent blocked by its own switch', async () => {
    repository.findByUser.mockResolvedValue(live({ news: false }));
    repository.findAgentSnapshots.mockResolvedValue([live({ news: false })]);

    const news = (await service.list('u1')).find(agent => agent.key === 'news');

    expect(news).toMatchObject({ enabled: false, active: false, blockedBy: 'switch' });
  });

  it('explains an agent waiting on autopilot', async () => {
    const manual = { ...live({ news: true }), mode: 'manual' };
    repository.findByUser.mockResolvedValue(manual);
    repository.findAgentSnapshots.mockResolvedValue([manual]);

    const agents = await service.list('u1');

    expect(agents.find(agent => agent.key === 'news')?.blockedBy).toBe('autopilot');
    expect(agents.find(agent => agent.key === 'post')?.blockedBy).toBe('autopilot');
  });

  it('treats a user with no policy yet as on the defaults', async () => {
    repository.findByUser.mockResolvedValue(null);
    repository.findAgentSnapshots.mockResolvedValue([]);

    const agents = await service.list('u1');

    expect(agents.find(agent => agent.key === 'news')).toMatchObject({
      enabled: false,
      chosen: false,
      blockedBy: 'switch',
    });
    expect(agents.find(agent => agent.key === 'analytics')?.active).toBe(true);
  });

  it('saves one switch without touching the others and returns its new state', async () => {
    repository.findByUser
      .mockResolvedValueOnce(live({ post: false }))
      .mockResolvedValue(live({ post: false, news: true }));

    const status = await service.setEnabled('u1', 'news', true);

    expect(repository.saveAgentChoices).toHaveBeenCalledWith('u1', { post: false, news: true });
    expect(status).toMatchObject({ key: 'news', enabled: true, chosen: true });
  });

  it('isActive short-circuits when the server blocks the agent', async () => {
    await expect(service.isActive('newsletter')).resolves.toBe(false);
    expect(repository.findAgentSnapshots).not.toHaveBeenCalled();
  });

  it('isActive asks every policy otherwise', async () => {
    repository.findAgentSnapshots.mockResolvedValue([
      { ...live(), mode: 'manual' },
      live({ news: true }),
    ]);

    await expect(service.isActive('news')).resolves.toBe(true);
  });

  it("adds each agent's last run and today's count from the shared run log", async () => {
    const agents = await service.list('u1');
    const byKey = Object.fromEntries(agents.map(agent => [agent.key, agent]));

    expect(runs.findLatestPerAgent).toHaveBeenCalledWith(['u1', 'workspace']);
    expect(byKey.news.lastRun).toEqual({
      id: 'run-news',
      status: 'succeeded',
      trigger: 'schedule',
      startedAt: '2026-09-24T08:00:00.000Z',
      finishedAt: '2026-09-24T08:00:04.000Z',
      summary: '118 items read · 9 new',
    });
    expect(byKey.news.runsToday).toBe(5);
    expect(byKey.post.runsToday).toBe(2);
    expect(byKey.newsletter.lastRun).toBeNull();
    expect(byKey.newsletter.runsToday).toBe(0);
  });

  it('summarises a failed run by its error and an unfinished one by its topic', async () => {
    runs.findLatestPerAgent.mockResolvedValue([
      { ...lastNewsRun, status: 'failed', errorMessage: 'Every feed failed', steps: [] },
      {
        ...lastNewsRun,
        id: 'run-a',
        agent: 'analytics',
        finishedAt: null,
        steps: [{ detail: null }],
      },
    ]);

    const agents = await service.list('u1');

    expect(agents.find(agent => agent.key === 'news')?.lastRun?.summary).toBe('Every feed failed');
    expect(agents.find(agent => agent.key === 'analytics')?.lastRun).toMatchObject({
      summary: 'Fetch news feeds',
      finishedAt: null,
    });
  });
});
