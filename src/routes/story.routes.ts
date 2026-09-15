import {
  approveStoryEpisode,
  createStory,
  generateEpisode,
  getPublicStory,
  getPublicStoryEpisode,
  getStory,
  getStoryEpisode,
  listPublicStories,
  listStories,
  listStoryEpisodes,
  publishStoryEpisode,
  recordEpisodeRead,
  recordEpisodeView,
  regenerateEpisode,
} from '@/controllers/story.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import { rateLimitGuard } from '@/middlewares/rateLimitGuard';
import {
  ApproveStoryEpisodeSchema,
  CreateStorySchema,
  GenerateEpisodeSchema,
  GetPublicStoryEpisodeSchema,
  GetPublicStorySchema,
  GetStoryEpisodeSchema,
  GetStorySchema,
  ListPublicStoriesSchema,
  ListStoriesSchema,
  ListStoryEpisodesSchema,
  PublishStoryEpisodeSchema,
  RecordEpisodeReadSchema,
  RecordEpisodeViewSchema,
  RegenerateEpisodeSchema,
} from '@/schemas/requests/story.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['stories'];
const PUBLIC_TAGS = ['stories-public'];

/** Each call is a real, paid LLM generation — generous enough for a real writing session. */
const EPISODE_GENERATION_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'story:generate',
};

export async function storyRoutes(app: FastifyInstance) {
  // Public reading surface — no auth, and only ever serves published episodes.
  // Registered before the authenticated :id routes; find-my-way matches the
  // literal "public" segment ahead of the :id param regardless of order, but
  // keeping it first here documents that this is the deliberately-open branch.
  app.get(
    '/stories/public',
    { schema: { ...ListPublicStoriesSchema, tags: PUBLIC_TAGS } },
    asyncWrapper(listPublicStories)
  );

  app.get(
    '/stories/public/:id',
    { schema: { ...GetPublicStorySchema, tags: PUBLIC_TAGS } },
    asyncWrapper(getPublicStory)
  );

  app.get(
    '/stories/public/:id/episodes/:episodeNumber',
    { schema: { ...GetPublicStoryEpisodeSchema, tags: PUBLIC_TAGS } },
    asyncWrapper(getPublicStoryEpisode)
  );

  app.post(
    '/stories/public/:id/episodes/:episodeNumber/view',
    { schema: { ...RecordEpisodeViewSchema, tags: PUBLIC_TAGS } },
    asyncWrapper(recordEpisodeView)
  );

  app.post(
    '/stories/public/:id/episodes/:episodeNumber/read',
    { schema: { ...RecordEpisodeReadSchema, tags: PUBLIC_TAGS } },
    asyncWrapper(recordEpisodeRead)
  );

  app.post(
    '/stories',
    { schema: { ...CreateStorySchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(createStory)
  );

  app.get(
    '/stories',
    { schema: { ...ListStoriesSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listStories)
  );

  app.get(
    '/stories/:id',
    { schema: { ...GetStorySchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getStory)
  );

  app.post(
    '/stories/:id/episodes',
    {
      schema: { ...GenerateEpisodeSchema, tags: TAGS },
      onRequest: [authGuard, rateLimitGuard(EPISODE_GENERATION_RATE_LIMIT)],
    },
    asyncWrapper(generateEpisode)
  );

  app.get(
    '/stories/:id/episodes',
    { schema: { ...ListStoryEpisodesSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listStoryEpisodes)
  );

  app.get(
    '/stories/:id/episodes/:episodeId',
    { schema: { ...GetStoryEpisodeSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getStoryEpisode)
  );

  app.post(
    '/stories/:id/episodes/:episodeId/regenerate',
    {
      schema: { ...RegenerateEpisodeSchema, tags: TAGS },
      onRequest: [authGuard, rateLimitGuard(EPISODE_GENERATION_RATE_LIMIT)],
    },
    asyncWrapper(regenerateEpisode)
  );

  app.post(
    '/stories/:id/episodes/:episodeId/approve',
    { schema: { ...ApproveStoryEpisodeSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(approveStoryEpisode)
  );

  app.post(
    '/stories/:id/episodes/:episodeId/publish',
    { schema: { ...PublishStoryEpisodeSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(publishStoryEpisode)
  );
}
