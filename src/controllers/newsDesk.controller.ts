import { FastifyReply, FastifyRequest } from 'fastify';
import { newsDeskService, type NewsDeskListQuery } from '@/services/newsDesk.service';
import type { NewsAgentStage } from '@/services/newsAgent.service';
import { success } from '@/utils/response';

interface IdParams {
  id: string;
}

export async function listNewsDeskArticles(request: FastifyRequest, reply: FastifyReply) {
  const result = await newsDeskService.list(request.query as NewsDeskListQuery);
  return success(reply, 200, 'Articles retrieved', 1200, result);
}

export async function getNewsDeskSummary(_request: FastifyRequest, reply: FastifyReply) {
  const summary = await newsDeskService.summary();
  return success(reply, 200, 'News desk summary retrieved', 1200, summary);
}

export async function getNewsDeskArticle(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const article = await newsDeskService.get(id);
  return success(reply, 200, 'Article retrieved', 1200, article);
}

export async function requeueNewsDeskArticle(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const article = await newsDeskService.requeue(id);
  return success(reply, 200, 'Article queued for enhancement', 1201, article);
}

export async function skipNewsDeskArticle(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const article = await newsDeskService.skip(id);
  return success(reply, 200, 'Article skipped', 1202, article);
}

export async function runNewsAgentStage(request: FastifyRequest, reply: FastifyReply) {
  const { stage } = request.params as { stage: NewsAgentStage };
  const result = newsDeskService.triggerStage(stage);
  return success(reply, 202, 'News agent stage started', 1204, result);
}

export async function featureNewsDeskArticle(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { featured } = request.body as { featured: boolean };
  const article = await newsDeskService.setFeatured(id, featured);
  return success(reply, 200, featured ? 'Article featured' : 'Article unfeatured', 1203, article);
}
