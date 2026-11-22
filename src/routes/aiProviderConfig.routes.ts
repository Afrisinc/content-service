import {
  listAiProviderConfigs,
  saveAiProviderConfig,
} from '@/controllers/aiProviderConfig.controller';
import { adminGuard } from '@/middlewares/adminGuard';
import { authGuard } from '@/middlewares/authGuard';
import {
  ListAiProviderConfigsSchema,
  SaveAiProviderConfigSchema,
} from '@/schemas/requests/aiProviderConfig.schema';
import { FastifyInstance } from 'fastify';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware';

export async function aiProviderConfigRoutes(app: FastifyInstance) {
  app.get(
    '/ai/provider-configs',
    {
      schema: ListAiProviderConfigsSchema,
      onRequest: [authGuard, adminGuard],
    },
    asyncWrapper(listAiProviderConfigs)
  );

  app.put(
    '/ai/provider-configs/:provider/:purpose',
    {
      schema: SaveAiProviderConfigSchema,
      onRequest: [authGuard, adminGuard],
    },
    asyncWrapper(saveAiProviderConfig)
  );
}
