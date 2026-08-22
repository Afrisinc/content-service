import {
  getAnalyticsAccounts,
  getAnalyticsOverview,
  getAnalyticsPlan,
  getAnalyticsSummary,
  getTopAnalytics,
  trackAnalyticsEvent,
} from '@/controllers/analytics.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import { oauthIpRateLimit } from '@/middlewares/oauthRateLimit';
import {
  GetAnalyticsAccountsSchema,
  GetAnalyticsOverviewSchema,
  GetAnalyticsPlanSchema,
  GetAnalyticsSummarySchema,
  GetTopAnalyticsSchema,
  TrackAnalyticsEventSchema,
} from '@/schemas/requests/analytics.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['analytics'];

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

  app.get(
    '/analytics/top',
    { schema: { ...GetTopAnalyticsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getTopAnalytics)
  );
}
