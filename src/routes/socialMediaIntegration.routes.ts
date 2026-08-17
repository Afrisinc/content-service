/**
 * Social Media Integration Routes
 * Defines endpoints for platform connections and their accounts
 */

import {
  addAccountFromFacebookPage,
  addSocialMediaAccount,
  deleteAccount,
  getAvailablePages,
  handleOAuthCallback,
  listIntegrations,
  saveIntegrationCredentials,
  updateIntegrationCredentials,
} from '@/controllers/socialMediaIntegration.controller';
import { authGuard } from '@/middlewares/authGuard';
import { oauthIpRateLimit } from '@/middlewares/oauthRateLimit';
import {
  AddSocialMediaAccountSchema,
  AvailablePagesSchema,
  ListIntegrationsSchema,
  OAuthCallbackSchema,
  SaveIntegrationCredentialsSchema,
  UpdateIntegrationCredentialsSchema,
} from '@/schemas/requests/socialMediaIntegration.schema';
import { FastifyInstance } from 'fastify';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware';

export async function socialMediaIntegrationRoutes(app: FastifyInstance) {
  app.get(
    '/social-media/integrations',
    {
      schema: ListIntegrationsSchema,
      onRequest: [authGuard],
    },
    asyncWrapper(listIntegrations)
  );

  app.post(
    '/social-media/integrations/:platform/credentials',
    {
      schema: SaveIntegrationCredentialsSchema,
      onRequest: [authGuard],
    },
    asyncWrapper(saveIntegrationCredentials)
  );

  app.patch(
    '/social-media/integrations/:platform/credentials',
    {
      schema: UpdateIntegrationCredentialsSchema,
      onRequest: [authGuard],
    },
    asyncWrapper(updateIntegrationCredentials)
  );

  app.post(
    '/social-media/integrations/:platform/accounts',
    {
      schema: AddSocialMediaAccountSchema,
      onRequest: [authGuard],
    },
    asyncWrapper(addSocialMediaAccount)
  );

  app.get(
    '/social-media/oauth/callback/:platform',
    {
      schema: OAuthCallbackSchema,
      onRequest: [oauthIpRateLimit],
    },
    asyncWrapper(handleOAuthCallback)
  );

  app.post(
    '/social-media/integrations/:platform/accounts/:pageId/from-facebook',
    {
      onRequest: [authGuard],
    },
    asyncWrapper(addAccountFromFacebookPage)
  );

  app.get(
    '/social-media/integrations/:platform/pages',
    {
      schema: AvailablePagesSchema,
      onRequest: [authGuard],
    },
    asyncWrapper(getAvailablePages)
  );

  app.delete(
    '/social-media/accounts/:accountId',
    {
      onRequest: [authGuard],
    },
    asyncWrapper(deleteAccount)
  );
}
