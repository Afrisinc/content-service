import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnauthorizedError } from '@/utils/http-error';

const control = vi.hoisted(() => ({ list: vi.fn(), setEnabled: vi.fn() }));

vi.mock('@/services/agentControl.service', () => ({ agentControlService: control }));
const automation = vi.hoisted(() => ({ listRuns: vi.fn(), summarise: vi.fn() }));

vi.mock('@/services/automation.service', () => ({ automationService: automation }));

const { getAutomationSummary, listAgentRuns, listAgents, updateAgent } =
  await import('@/controllers/automation.controller');

function fakeReply() {
  const reply = { status: vi.fn(), send: vi.fn() };
  reply.status.mockReturnValue(reply);
  reply.send.mockReturnValue(reply);
  return reply;
}

const signedIn = (parts: Partial<FastifyRequest> = {}) =>
  ({ user: { userId: 'u1' }, ...parts }) as FastifyRequest;

describe('agent settings endpoints', () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the signed-in user's agents", async () => {
    control.list.mockResolvedValue([{ key: 'news' }]);
    const reply = fakeReply();

    await listAgents(signedIn(), reply as unknown as FastifyReply);

    expect(control.list).toHaveBeenCalledWith('u1');
    expect(reply.send.mock.calls[0][0].data).toEqual([{ key: 'news' }]);
  });

  it.each([
    [true, 'Agent switched on'],
    [false, 'Agent switched off'],
  ])('switches an agent (enabled=%s)', async (enabled, message) => {
    control.setEnabled.mockResolvedValue({ key: 'news', enabled });
    const reply = fakeReply();

    await updateAgent(
      signedIn({ params: { key: 'news' }, body: { enabled } }),
      reply as unknown as FastifyReply
    );

    expect(control.setEnabled).toHaveBeenCalledWith('u1', 'news', enabled);
    expect(reply.send.mock.calls[0][0].resp_msg).toBe(message);
  });

  it('refuses an anonymous request', async () => {
    await expect(
      listAgents({} as FastifyRequest, fakeReply() as unknown as FastifyReply)
    ).rejects.toThrow(UnauthorizedError);
  });

  it('passes the agent filter through to the run log', async () => {
    automation.listRuns.mockResolvedValue({ items: [] });

    await listAgentRuns(
      signedIn({ query: { agent: 'news', limit: 12 } }),
      fakeReply() as unknown as FastifyReply
    );

    expect(automation.listRuns).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', agent: 'news', limit: 12 })
    );
  });

  it('narrows the summary to one agent when asked', async () => {
    automation.summarise.mockResolvedValue({ succeeded: 1 });

    await getAutomationSummary(
      signedIn({ query: { agent: 'analytics' } }),
      fakeReply() as unknown as FastifyReply
    );

    expect(automation.summarise).toHaveBeenCalledWith('u1', undefined, 'analytics');
  });
});
