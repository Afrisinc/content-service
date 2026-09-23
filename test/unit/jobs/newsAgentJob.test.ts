import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NEWS_AGENT_ENABLED: true,
  CRON_SCHEDULE_NEWS_INGEST: '*/30 * * * *',
  CRON_SCHEDULE_NEWS_ENHANCE: '*/10 * * * *',
}));
const schedule = vi.hoisted(() => vi.fn());
const agent = vi.hoisted(() => ({ runIngestion: vi.fn(), runEnhancement: vi.fn() }));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('node-cron', () => ({ default: { schedule } }));
vi.mock('@/services/newsAgent.service', () => ({ newsAgentService: agent }));

const { startNewsAgentJobs, stopNewsAgentJobs } = await import('@/jobs/newsAgentJob');

describe('news agent jobs', () => {
  const stop = vi.fn();

  beforeEach(() => {
    stopNewsAgentJobs();
    vi.clearAllMocks();
    envMock.NEWS_AGENT_ENABLED = true;
    schedule.mockImplementation(() => ({ stop }));
  });

  it('schedules ingestion and enhancement on their own crons', () => {
    startNewsAgentJobs();

    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule.mock.calls[0][0]).toBe('*/30 * * * *');
    expect(schedule.mock.calls[1][0]).toBe('*/10 * * * *');

    schedule.mock.calls[0][1]();
    schedule.mock.calls[1][1]();
    expect(agent.runIngestion).toHaveBeenCalledTimes(1);
    expect(agent.runEnhancement).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the agent is disabled', () => {
    envMock.NEWS_AGENT_ENABLED = false;

    startNewsAgentJobs();

    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not schedule twice', () => {
    startNewsAgentJobs();
    startNewsAgentJobs();

    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('stops both jobs', () => {
    startNewsAgentJobs();
    stopNewsAgentJobs();

    expect(stop).toHaveBeenCalledTimes(2);
  });
});
