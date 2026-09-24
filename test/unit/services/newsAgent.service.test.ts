import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NEWS_AGENT_ENABLED: true,
  NEWS_RSS_SOURCES: '',
  NEWS_MIN_SCORE: 0.6,
  NEWS_ENHANCE_BATCH_SIZE: 5,
  CRON_SCHEDULE_NEWS_INGEST: '*/30 * * * *',
  CRON_SCHEDULE_NEWS_ENHANCE: '*/10 * * * *',
}));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('@/services/newsIngestion.service', () => ({ newsIngestionService: { run: vi.fn() } }));
vi.mock('@/services/newsEnhancement.service', () => ({ newsEnhancementService: { run: vi.fn() } }));
vi.mock('@/services/agentRunRecorder.service', () => ({ agentRunRecorder: { record: vi.fn() } }));

const { NewsAgentService } = await import('@/services/newsAgent.service');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('NewsAgentService', () => {
  const ingestion = { run: vi.fn() };
  const enhancement = { run: vi.fn() };
  const recorder = {
    record: vi.fn(({ execute }: { execute: () => Promise<unknown> }) => execute()),
  };
  let agent: InstanceType<typeof NewsAgentService>;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = new NewsAgentService(ingestion as never, enhancement as never, recorder as never);
  });

  it('runs a stage and remembers its result', async () => {
    ingestion.run.mockResolvedValue({ created: 3 });

    await expect(agent.runIngestion()).resolves.toEqual({ created: 3 });

    const status = agent.status().ingest;
    expect(status).toMatchObject({ running: false, lastResult: { created: 3 }, lastError: null });
    expect(status.lastFinishedAt).toEqual(expect.any(String));
  });

  it('never runs the same stage twice at once', async () => {
    const pending = deferred<{ published: number }>();
    enhancement.run.mockReturnValue(pending.promise);

    const first = agent.runEnhancement();
    await expect(agent.runEnhancement()).resolves.toBeNull();
    expect(agent.status().enhance.running).toBe(true);

    pending.resolve({ published: 1 });
    await first;
    expect(enhancement.run).toHaveBeenCalledTimes(1);
  });

  it('captures a failed run instead of throwing, and clears it on the next success', async () => {
    enhancement.run.mockRejectedValueOnce(new Error('OPENAI_API_KEY missing'));
    await expect(agent.runEnhancement()).resolves.toBeNull();
    expect(agent.status().enhance.lastError).toBe('OPENAI_API_KEY missing');

    enhancement.run.mockResolvedValueOnce({ published: 0 });
    await agent.runEnhancement();
    expect(agent.status().enhance.lastError).toBeNull();
  });

  it('records a non-Error failure as text', async () => {
    ingestion.run.mockRejectedValue('offline');

    await agent.runIngestion();

    expect(agent.status().ingest.lastError).toBe('offline');
  });

  it('trigger starts the requested stage in the background', async () => {
    ingestion.run.mockResolvedValue({});
    enhancement.run.mockResolvedValue({});

    expect(agent.trigger('ingest')).toBe(true);
    expect(agent.trigger('enhance')).toBe(true);
    await Promise.resolve();

    expect(ingestion.run).toHaveBeenCalledTimes(1);
    expect(enhancement.run).toHaveBeenCalledTimes(1);
  });

  it('trigger refuses a stage that is already running', () => {
    ingestion.run.mockReturnValue(deferred().promise);

    agent.trigger('ingest');

    expect(agent.trigger('ingest')).toBe(false);
    expect(ingestion.run).toHaveBeenCalledTimes(1);
  });

  it('reports its configuration', () => {
    expect(agent.status()).toMatchObject({
      allowedByServer: true,
      sources: 13,
      minScore: 0.6,
      batchSize: 5,
      ingest: { schedule: '*/30 * * * *' },
      enhance: { schedule: '*/10 * * * *' },
    });
  });

  it('records scheduled runs in the run log with the stage outcome', async () => {
    ingestion.run.mockResolvedValue({ fetched: 3, created: 1, failedSources: [], sources: 2 });

    await agent.runIngestion();

    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({
        agent: 'news',
        trigger: 'schedule',
        stepLabel: 'Fetch feeds',
        outcome: expect.any(Function),
      })
    );
  });

  it('records a hand-started run as manual', async () => {
    enhancement.run.mockResolvedValue({ claimed: 0, recovered: 0 });

    agent.trigger('enhance');
    await Promise.resolve();

    expect(recorder.record).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: 'manual', stepLabel: 'Write & publish' })
    );
  });
});
