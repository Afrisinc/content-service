import { StoryStatus } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { assertStoryBrief, storyService, type StoryBrief } from '@/services/story.service';
import { storyEpisodeService } from '@/services/storyEpisode.service';
import { UnauthorizedError } from '@/utils/http-error';
import { success } from '@/utils/response';
import { readerDeviceId, requireReaderDeviceId } from '@/utils/readerDevice';

interface IdParams {
  id: string;
}

interface EpisodeParams extends IdParams {
  episodeId: string;
}

function requireUserId(request: FastifyRequest): string {
  const userId = request.user?.userId;
  if (!userId) {
    throw new UnauthorizedError('authentication required');
  }
  return userId;
}

export async function createStory(request: FastifyRequest, reply: FastifyReply) {
  const body = request.body as Omit<StoryBrief, 'userId'>;
  assertStoryBrief(body);

  const story = await storyService.create({ ...body, userId: requireUserId(request) });
  return success(reply, 201, 'Story created', 1101, story);
}

export async function listStories(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { status?: StoryStatus; page?: number; limit?: number };
  const result = await storyService.list({ ...query, userId: requireUserId(request) });
  return success(reply, 200, 'Stories retrieved', 1100, result);
}

export async function getStory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const story = await storyService.get(id);
  return success(reply, 200, 'Story retrieved', 1100, story);
}

export async function listPublicStories(request: FastifyRequest, reply: FastifyReply) {
  const query = request.query as { page?: number; limit?: number };
  const result = await storyService.listPublic(query);
  return success(reply, 200, 'Stories retrieved', 1100, result);
}

export async function getPublicStory(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const story = await storyService.getPublic(id, readerDeviceId(request));
  return success(reply, 200, 'Story retrieved', 1100, story);
}

export async function getPublicStoryEpisode(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeNumber } = request.params as { id: string; episodeNumber: string };
  const episode = await storyEpisodeService.getPublicByNumber(id, Number(episodeNumber));
  return success(reply, 200, 'Episode retrieved', 1100, episode);
}

export async function recordEpisodeView(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeNumber } = request.params as { id: string; episodeNumber: string };
  await storyEpisodeService.recordView(id, Number(episodeNumber), requireReaderDeviceId(request));
  return success(reply, 200, 'View recorded', 1106);
}

export async function recordEpisodeRead(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeNumber } = request.params as { id: string; episodeNumber: string };
  await storyEpisodeService.recordCompletedRead(
    id,
    Number(episodeNumber),
    requireReaderDeviceId(request)
  );
  return success(reply, 200, 'Read recorded', 1105);
}

export async function generateEpisode(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const { instructions, idempotencyKey } = (request.body ?? {}) as {
    instructions?: string;
    idempotencyKey?: string;
  };
  const episode = await storyEpisodeService.generateNext(id, { instructions, idempotencyKey });
  return success(reply, 201, 'Episode generated', 1102, episode);
}

export async function regenerateEpisode(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeId } = request.params as EpisodeParams;
  const { instructions } = (request.body ?? {}) as { instructions?: string };
  const episode = await storyEpisodeService.regenerate(id, episodeId, { instructions });
  return success(reply, 200, 'Episode regenerated', 1107, episode);
}

export async function listStoryEpisodes(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as IdParams;
  const query = request.query as { page?: number; limit?: number };
  const result = await storyEpisodeService.list(id, query);
  return success(reply, 200, 'Episodes retrieved', 1100, result);
}

export async function getStoryEpisode(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeId } = request.params as EpisodeParams;
  const episode = await storyEpisodeService.get(id, episodeId);
  return success(reply, 200, 'Episode retrieved', 1100, episode);
}

export async function approveStoryEpisode(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeId } = request.params as EpisodeParams;
  const episode = await storyEpisodeService.approve(id, episodeId);
  return success(reply, 200, 'Episode approved', 1103, episode);
}

export async function publishStoryEpisode(request: FastifyRequest, reply: FastifyReply) {
  const { id, episodeId } = request.params as EpisodeParams;
  const episode = await storyEpisodeService.publish(id, episodeId);
  return success(reply, 200, 'Episode published', 1104, episode);
}
