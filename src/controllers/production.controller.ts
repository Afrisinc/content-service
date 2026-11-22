import { ApprovalStage, ProductionStatus } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import {
  assertBrief,
  productionService,
  type ProductionBrief,
} from '@/services/production.service';
import { UnauthorizedError } from '@/utils/http-error';
import { success } from '@/utils/response';

interface IdParams {
  id: string;
}

interface SceneParams extends IdParams {
  sceneId: string;
}

function requireUserId(request: FastifyRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('authentication required');
  }
  return userId;
}

export async function createProduction(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as Omit<ProductionBrief, 'userId'>;
  assertBrief(body);

  const production = await productionService.create({ ...body, userId: requireUserId(request) });
  return success(reply, 201, 'Production created', 1001, production);
}

export async function startProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const production = await productionService.start(id);
  return success(reply, 202, 'Production started', 1002, production);
}

export async function getProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const production = await productionService.get(id);
  return success(reply, 200, 'Production retrieved', 1000, production);
}

export async function listProductions(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { status?: ProductionStatus; page?: number; limit?: number };
  const result = await productionService.list({ ...query, userId: requireUserId(request) });
  return success(reply, 200, 'Productions retrieved', 1000, result);
}

export async function getProductionStatus(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const status = await productionService.status(id);
  return success(reply, 200, 'Production status retrieved', 1000, status);
}

export async function getProductionEvents(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const events = await productionService.events(id);
  return success(reply, 200, 'Production timeline retrieved', 1000, events);
}

export async function approveProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { stage } = request.body as { stage: ApprovalStage };
  const production = await productionService.approve(id, stage, requireUserId(request));
  return success(reply, 200, 'Stage approved', 1003, production);
}

export async function rejectProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { stage, reason } = request.body as { stage: ApprovalStage; reason: string };
  const production = await productionService.reject(id, stage, requireUserId(request), reason);
  return success(reply, 200, 'Stage rejected', 1004, production);
}

export async function rerenderScene(request: FastifyRequest, reply: FastifyReply) {
  const { id, sceneId } = request.params as SceneParams;
  const result = await productionService.rerenderScene(id, sceneId);
  return success(reply, 202, 'Scene queued for re-render', 1005, result);
}

export async function publishProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { scheduledFor } = (request.body ?? {}) as { scheduledFor?: string };
  const production = await productionService.publish(
    id,
    scheduledFor ? new Date(scheduledFor) : undefined
  );
  return success(reply, 202, 'Production queued for publishing', 1006, production);
}

export async function retryProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const production = await productionService.retry(id);
  return success(reply, 202, 'Production retrying', 1007, production);
}

export async function cancelProduction(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { reason } = (request.body ?? {}) as { reason?: string };
  const production = await productionService.cancel(id, reason ?? 'cancelled by the operator');
  return success(reply, 200, 'Production cancelled', 1008, production);
}
