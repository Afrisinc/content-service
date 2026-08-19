import {
  approvePostDraft,
  createPostDraft,
  getPostDraft,
  listPostDrafts,
  rejectPostDraft,
  rerenderPostDraft,
  schedulePostDraft,
} from '@/controllers/postAgent.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import {
  ApprovePostDraftSchema,
  CreatePostDraftSchema,
  GetPostDraftSchema,
  ListPostDraftsSchema,
  RejectPostDraftSchema,
  RerenderPostDraftSchema,
  SchedulePostDraftSchema,
} from '@/schemas/requests/postAgent.schema';
import { FastifyInstance } from 'fastify';

const TAGS = ['post-agent'];

export async function postAgentRoutes(app: FastifyInstance) {
  app.post(
    '/ai/posts',
    { schema: { ...CreatePostDraftSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(createPostDraft)
  );

  app.get(
    '/ai/posts',
    { schema: { ...ListPostDraftsSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listPostDrafts)
  );

  app.get(
    '/ai/posts/:id',
    { schema: { ...GetPostDraftSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(getPostDraft)
  );

  app.post(
    '/ai/posts/:id/render',
    { schema: { ...RerenderPostDraftSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(rerenderPostDraft)
  );

  app.post(
    '/ai/posts/:id/approve',
    { schema: { ...ApprovePostDraftSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(approvePostDraft)
  );

  app.post(
    '/ai/posts/:id/reject',
    { schema: { ...RejectPostDraftSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(rejectPostDraft)
  );

  app.post(
    '/ai/posts/:id/schedule',
    { schema: { ...SchedulePostDraftSchema, tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(schedulePostDraft)
  );
}
