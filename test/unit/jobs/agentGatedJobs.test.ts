import { beforeEach, describe, expect, it, vi } from 'vitest';

const envMock = vi.hoisted(() => ({
  NEWSLETTER_DIGEST_ENABLED: true,
  CRON_SCHEDULE_NEWSLETTER_DIGEST: '30 6 * * *',
  ANALYTICS_PULL_ENABLED: true,
  CRON_SCHEDULE_ANALYTICS_PULL: '20 * * * *',
}));
const schedule = vi.hoisted(() => vi.fn());
const control = vi.hoisted(() => ({ isActive: vi.fn() }));
const digest = vi.hoisted(() => ({ run: vi.fn() }));
const pull = vi.hoisted(() => ({ run: vi.fn() }));

vi.mock('@/config/env', () => ({ env: envMock }));
vi.mock('node-cron', () => ({ default: { schedule } }));
vi.mock('@/services/agentControl.service', () => ({ agentControlService: control }));
vi.mock('@/services/newsletterDigest.service', () => ({ newsletterDigestService: digest }));
vi.mock('@/services/analyticsPull.service', () => ({ analyticsPullService: pull }));
vi.mock('@/services/agentRunRecorder.service', () => ({
  agentRunRecorder: {
    record: vi.fn(({ execute }: { execute: () => Promise<unknown> }) => execute()),
  },
}));

const newsletter = await import('@/jobs/newsletterDigestJob');
const analytics = await import('@/jobs/analyticsPullJob');

describe.each([
  ['newsletter', newsletter.startNewsletterDigestJob, newsletter.stopNewsletterDigestJob, digest],
  ['analytics', analytics.startAnalyticsPullJob, analytics.stopAnalyticsPullJob, pull],
] as const)('%s job', (key, start, stop, service) => {
  beforeEach(() => {
    stop();
    vi.clearAllMocks();
    schedule.mockImplementation(() => ({ stop: vi.fn() }));
    service.run.mockResolvedValue({ status: 'sent' });
  });

  it('runs a tick while its agent is active', async () => {
    control.isActive.mockResolvedValue(true);
    start();

    await schedule.mock.calls[0][1]();

    expect(control.isActive).toHaveBeenCalledWith(key);
    expect(service.run).toHaveBeenCalledTimes(1);
  });

  it('skips a tick while its agent is switched off', async () => {
    control.isActive.mockResolvedValue(false);
    start();

    await schedule.mock.calls[0][1]();

    expect(service.run).not.toHaveBeenCalled();
  });

  it('lets the next tick run after a skipped one', async () => {
    control.isActive.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    start();

    await schedule.mock.calls[0][1]();
    await schedule.mock.calls[0][1]();

    expect(service.run).toHaveBeenCalledTimes(1);
  });
});
