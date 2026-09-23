import {
  featureNewsDeskArticle,
  runNewsAgentStage,
  getNewsDeskArticle,
  getNewsDeskSummary,
  listNewsDeskArticles,
  requeueNewsDeskArticle,
  skipNewsDeskArticle,
} from '@/controllers/newsDesk.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import { rateLimitGuard } from '@/middlewares/rateLimitGuard';
import {
  FeatureNewsDeskArticleSchema,
  GetNewsDeskArticleSchema,
  ListNewsDeskArticlesSchema,
  NewsDeskArticleActionSchema,
  RunNewsAgentStageSchema,
} from '@/schemas/requests/newsDesk.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['news-desk'];

/** An enhance run spends OpenAI money on every article it picks up. */
const MANUAL_RUN_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000,
  maxRequests: 6,
  keyPrefix: 'news-desk:run',
};

/**
 * The editor's view of the news agent (RSS ingestion → AI enhancement). Separate
 * from the public /articles routes the website reads without a user token.
 */
export async function newsDeskRoutes(app: FastifyInstance) {
  app.get(
    '/news-desk/summary',
    { schema: { tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getNewsDeskSummary)
  );

  app.get(
    '/news-desk/articles',
    { schema: { ...ListNewsDeskArticlesSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listNewsDeskArticles)
  );

  app.get(
    '/news-desk/articles/:id',
    { schema: { ...GetNewsDeskArticleSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getNewsDeskArticle)
  );

  app.post(
    '/news-desk/runs/:stage',
    {
      schema: { ...RunNewsAgentStageSchema, tags: TAGS },
      onRequest: [authGuard, rateLimitGuard(MANUAL_RUN_RATE_LIMIT)],
    },
    asyncWrapper(runNewsAgentStage)
  );

  app.post(
    '/news-desk/articles/:id/requeue',
    { schema: { ...NewsDeskArticleActionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(requeueNewsDeskArticle)
  );

  app.post(
    '/news-desk/articles/:id/skip',
    { schema: { ...NewsDeskArticleActionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(skipNewsDeskArticle)
  );

  app.post(
    '/news-desk/articles/:id/feature',
    { schema: { ...FeatureNewsDeskArticleSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(featureNewsDeskArticle)
  );
}
