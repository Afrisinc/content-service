import { postAgentService } from '@/services/postAgent.service';
import { PostBriefPayload, SchedulePostPayload } from '@/types/post.types';
import { UnauthorizedError } from '@/utils/http-error';
import { success } from '@/utils/response';
import { PostDraftStatus } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';

interface IdParams {
  id: string;
}

function requireUserId(request: FastifyRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('authentication required');
  }
  return userId;
}

export async function createPostDraft(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as PostBriefPayload;
  const draft = await postAgentService.createFromBrief({
    ...body,
    userId: requireUserId(request),
  });
  return success(reply, 201, 'Post drafted', 1001, draft);
}

export async function rerenderPostDraft(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const draft = await postAgentService.rerender(id);
  return success(reply, 200, 'Post re-rendered', 1002, draft);
}

export async function getPostDraft(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const draft = await postAgentService.get(id);
  return success(reply, 200, 'Post draft retrieved', 1000, draft);
}

export async function listPostDrafts(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as {
    status?: PostDraftStatus;
    format?: string;
    page?: number;
    limit?: number;
  };
  const result = await postAgentService.list({
    userId: requireUserId(request),
    status: query.status,
    format: query.format,
    page: query.page,
    limit: query.limit,
  });
  return success(reply, 200, 'Post drafts retrieved', 1000, result);
}

export async function approvePostDraft(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const draft = await postAgentService.approve(id, requireUserId(request));
  return success(reply, 200, 'Post approved', 1002, draft);
}

export async function rejectPostDraft(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { reason } = request.body as { reason: string };
  const draft = await postAgentService.reject(id, reason);
  return success(reply, 200, 'Post rejected', 1002, draft);
}

export async function schedulePostDraft(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const payload = request.body as SchedulePostPayload;
  const draft = await postAgentService.schedule(id, payload);
  return success(reply, 200, 'Post scheduled', 1002, draft);
}
