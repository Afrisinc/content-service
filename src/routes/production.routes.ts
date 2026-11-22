import {
  approveProduction,
  cancelProduction,
  createProduction,
  getProduction,
  getProductionEvents,
  getProductionStatus,
  listProductions,
  publishProduction,
  rejectProduction,
  rerenderScene,
  retryProduction,
  startProduction,
} from '@/controllers/production.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import {
  ApproveProductionSchema,
  CancelProductionSchema,
  CreateProductionSchema,
  GetProductionSchema,
  ListProductionsSchema,
  ProductionEventsSchema,
  ProductionStatusSchema,
  PublishProductionSchema,
  RejectProductionSchema,
  RerenderSceneSchema,
  RetryProductionSchema,
  StartProductionSchema,
} from '@/schemas/requests/production.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['studio'];

export async function productionRoutes(app: FastifyInstance) {
  app.post(
    '/studio/productions',
    { schema: { ...CreateProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(createProduction)
  );

  app.get(
    '/studio/productions',
    { schema: { ...ListProductionsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listProductions)
  );

  app.get(
    '/studio/productions/:id',
    { schema: { ...GetProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getProduction)
  );

  app.get(
    '/studio/productions/:id/status',
    { schema: { ...ProductionStatusSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getProductionStatus)
  );

  app.get(
    '/studio/productions/:id/events',
    { schema: { ...ProductionEventsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getProductionEvents)
  );

  app.post(
    '/studio/productions/:id/generate',
    { schema: { ...StartProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(startProduction)
  );

  app.post(
    '/studio/productions/:id/approve',
    { schema: { ...ApproveProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(approveProduction)
  );

  app.post(
    '/studio/productions/:id/reject',
    { schema: { ...RejectProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(rejectProduction)
  );

  app.post(
    '/studio/productions/:id/scenes/:sceneId/rerender',
    { schema: { ...RerenderSceneSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(rerenderScene)
  );

  app.post(
    '/studio/productions/:id/publish',
    { schema: { ...PublishProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(publishProduction)
  );

  app.post(
    '/studio/productions/:id/retry',
    { schema: { ...RetryProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(retryProduction)
  );

  app.post(
    '/studio/productions/:id/cancel',
    { schema: { ...CancelProductionSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(cancelProduction)
  );
}
