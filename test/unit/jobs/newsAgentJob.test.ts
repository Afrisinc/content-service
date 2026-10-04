import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NEWS_AGENT_ENABLED: true,
  CRON_SCHEDULE_NEWS_INGEST: '*/30 * * * *',
  CRON_SCHEDULE_NEWS_ENHANCE: '*/10 * * * *',
}));
const schedule = vi.hoisted(() => vi.fn());
const agent = vi.hoisted(() => ({ runIngestion: vi.fn(), runEnhancement: vi.fn() }));
const control = vi.hoisted(() => ({ isActive: vi.fn() }));
const settings = vi.hoisted(() => ({ getNewsSettings: vi.fn() }));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('node-cron', () => ({ default: { schedule } }));
vi.mock('@/services/newsAgent.service', () => ({ newsAgentService: agent }));
vi.mock('@/services/agentControl.service', () => ({ agentControlService: control }));
vi.mock('@/services/agentSettings.service', () => ({ agentSettingsService: settings }));

const { startNewsAgentJobs, stopNewsAgentJobs } = await import('@/jobs/newsAgentJob');

describe('news agent jobs', () => {
  const stop = vi.fn();

  beforeEach(() => {
    stopNewsAgentJobs();
    vi.clearAllMocks();
    envMock.NEWS_AGENT_ENABLED = true;
    schedule.mockImplementation(() => ({ stop }));
    control.isActive.mockResolvedValue(true);
    settings.getNewsSettings.mockResolvedValue({ batchSize: 1, days: [0, 1, 2, 3, 4, 5, 6] });
    vi.useRealTimers();
  });

  it('schedules ingestion and enhancement on their own crons', async () => {
    startNewsAgentJobs();

    expect(schedule).toHaveBeenCalledTimes(2);
    expect(schedule.mock.calls[0][0]).toBe('*/30 * * * *');
    expect(schedule.mock.calls[1][0]).toBe('*/10 * * * *');

    await schedule.mock.calls[0][1]();
    await schedule.mock.calls[1][1]();
    expect(control.isActive).toHaveBeenCalledWith('news');
    expect(agent.runIngestion).toHaveBeenCalledTimes(1);
    expect(agent.runEnhancement).toHaveBeenCalledTimes(1);
  });

  it('skips a tick while the dashboard switch or autopilot is off', async () => {
    control.isActive.mockResolvedValue(false);
    startNewsAgentJobs();

    await schedule.mock.calls[0][1]();
    await schedule.mock.calls[1][1]();

    expect(agent.runIngestion).not.toHaveBeenCalled();
    expect(agent.runEnhancement).not.toHaveBeenCalled();
  });

  describe('on the days the user picked', () => {
    const MONDAY = new Date('2026-10-05T07:00:00.000Z');
    const TUESDAY = new Date('2026-10-06T07:00:00.000Z');

    afterEach(() => {
      vi.useRealTimers();
    });

    it('runs both stages on a chosen day', async () => {
      vi.useFakeTimers({ now: MONDAY });
      settings.getNewsSettings.mockResolvedValue({ batchSize: 1, days: [1] });
      startNewsAgentJobs();

      await schedule.mock.calls[0][1]();
      await schedule.mock.calls[1][1]();

      expect(agent.runIngestion).toHaveBeenCalledTimes(1);
      expect(agent.runEnhancement).toHaveBeenCalledTimes(1);
    });

    it('skips both stages on any other day', async () => {
      vi.useFakeTimers({ now: TUESDAY });
      settings.getNewsSettings.mockResolvedValue({ batchSize: 1, days: [1] });
      startNewsAgentJobs();

      await schedule.mock.calls[0][1]();
      await schedule.mock.calls[1][1]();

      expect(agent.runIngestion).not.toHaveBeenCalled();
      expect(agent.runEnhancement).not.toHaveBeenCalled();
    });

    it('does not even read the days while the agent is switched off', async () => {
      control.isActive.mockResolvedValue(false);
      startNewsAgentJobs();

      await schedule.mock.calls[0][1]();

      expect(settings.getNewsSettings).not.toHaveBeenCalled();
    });
  });

  it('survives a failing tick', async () => {
    control.isActive.mockRejectedValue(new Error('db down'));
    startNewsAgentJobs();

    await expect(schedule.mock.calls[0][1]()).resolves.toBeUndefined();
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
