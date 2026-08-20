import { automationService } from '@/services/automation.service';
import { UpdateAutomationPolicyPayload } from '@/types/accountGroup.types';
import { UnauthorizedError } from '@/utils/http-error';
import { success } from '@/utils/response';
import { AgentRunStatus } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';

function requireUserId(request: FastifyRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('authentication required');
  }
  return userId;
}

export async function getAutomationPolicy(request: FastifyRequest, reply: FastifyReply) {
  const policy = await automationService.getPolicy(requireUserId(request));
  return success(reply, 200, 'Automation policy retrieved', 1000, policy);
}

export async function updateAutomationPolicy(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as UpdateAutomationPolicyPayload;
  const policy = await automationService.updatePolicy(requireUserId(request), body);
  return success(reply, 200, 'Automation policy updated', 1002, policy);
}

export async function listAgentRuns(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as {
    groupId?: string;
    status?: AgentRunStatus;
    page?: number;
    limit?: number;
  };
  const result = await automationService.listRuns({
    userId: requireUserId(request),
    groupId: query.groupId,
    status: query.status,
    page: query.page,
    limit: query.limit,
  });
  return success(reply, 200, 'Agent runs retrieved', 1000, result);
}

export async function getAgentRun(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const run = await automationService.getRun(requireUserId(request), id);
  return success(reply, 200, 'Agent run retrieved', 1000, run);
}

export async function getAutomationSummary(request: FastifyRequest, reply: FastifyReply) {
  const summary = await automationService.summarise(requireUserId(request));
  return success(reply, 200, 'Automation summary retrieved', 1000, summary);
}

export async function runAutomationNow(request: FastifyRequest, reply: FastifyReply) {
  const outcome = await automationService.requestRun(requireUserId(request));

  const message = outcome.accepted
    ? 'Agents are running — follow along in the run log'
    : (outcome.reason ?? 'Nothing to run');

  return success(reply, 202, message, 1004, outcome);
}

export async function resumeAgentRun(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const outcome = await automationService.requestResume(requireUserId(request), id);

  const message = outcome.accepted
    ? 'Picking up where it stopped'
    : (outcome.reason ?? 'Could not resume');

  return success(reply, 202, message, 1004, outcome);
}

export async function cancelAgentRun(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const outcome = await automationService.cancel(requireUserId(request), id);
  return success(reply, 200, 'Run stopped', 1002, outcome);
}

export async function getActiveAgentRun(request: FastifyRequest, reply: FastifyReply) {
  const run = await automationService.getActiveRun(requireUserId(request));
  return success(reply, 200, run ? 'A run is in progress' : 'Nothing running', 1000, { run });
}
