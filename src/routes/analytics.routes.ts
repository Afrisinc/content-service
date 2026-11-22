import {
  getAnalyticsAccounts,
  getAnalyticsOverview,
  getAnalyticsPlan,
  getAnalyticsSummary,
  getTopAnalytics,
  suggestPostIdeas,
  trackAnalyticsEvent,
} from '@/controllers/analytics.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import { oauthIpRateLimit } from '@/middlewares/oauthRateLimit';
import { rateLimitGuard } from '@/middlewares/rateLimitGuard';
import {
  GetAnalyticsAccountsSchema,
  GetAnalyticsOverviewSchema,
  GetAnalyticsPlanSchema,
  GetAnalyticsSummarySchema,
  GetTopAnalyticsSchema,
  SuggestPostIdeasSchema,
  TrackAnalyticsEventSchema,
} from '@/schemas/requests/analytics.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['analytics'];

const POST_IDEAS_RATE_LIMIT = {
  windowMs: 60 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'analytics:ideas',
};

export async function analyticsRoutes(app: FastifyInstance) {
  app.post(
    '/analytics/track',
    { schema: { ...TrackAnalyticsEventSchema, tags: TAGS }, onRequest: [oauthIpRateLimit] },
    asyncWrapper(trackAnalyticsEvent)
  );

  app.get(
    '/analytics/summary',
    { schema: { ...GetAnalyticsSummarySchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAnalyticsSummary)
  );

  app.get(
    '/analytics/overview',
    { schema: { ...GetAnalyticsOverviewSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAnalyticsOverview)
  );

  app.get(
    '/analytics/accounts',
    { schema: { ...GetAnalyticsAccountsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAnalyticsAccounts)
  );

  app.get(
    '/analytics/plan',
    { schema: { ...GetAnalyticsPlanSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getAnalyticsPlan)
  );

  app.post(
    '/analytics/plan/ideas',
    {
      schema: { ...SuggestPostIdeasSchema, tags: TAGS },
      onRequest: [authGuard, rateLimitGuard(POST_IDEAS_RATE_LIMIT)],
    },
    asyncWrapper(suggestPostIdeas)
  );

  app.get(
    '/analytics/top',
    { schema: { ...GetTopAnalyticsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getTopAnalytics)
  );
}
