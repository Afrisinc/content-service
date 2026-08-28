/**
 * Social Media Routes
 * Defines all endpoints for social media operations
 */

import {
  GetSocialMediaPostSchema,
  PostToSocialMediaSchema,
  BatchPostToSocialMediaSchema,
  ListSocialMediaPostsSchema,
  ListUserSocialMediaPostsSchema,
  PublishScheduledPostSchema,
  RepostSocialMediaPostSchema,
} from '@/schemas/requests/socialMedia.schema';
import { FastifyInstance } from 'fastify';
import {
  batchPostToSocialMedia,
  deleteSocialMediaPost,
  getAllSocialMediaPosts,
  getSocialMediaPost,
  getUserSocialMediaPosts,
  postToSocialMedia,
  publishScheduledPostNow,
  repostSocialMediaPost,
  updateSocialMediaPost,
  validateSocialMediaPayload,
} from '../controllers/socialMedia.controller';
import { asyncWrapper } from '../middlewares/async_wrapper.middleware';
import { authGuard } from '../middlewares/authGuard';

export async function socialMediaRoutes(app: FastifyInstance) {
  app.post(
    '/social-media/post',
    { schema: PostToSocialMediaSchema, onRequest: [authGuard] },
    asyncWrapper(postToSocialMedia)
  );

  app.post(
    '/social-media/batch',
    { schema: BatchPostToSocialMediaSchema, onRequest: [authGuard] },
    asyncWrapper(batchPostToSocialMedia)
  );

  app.get(
    '/social-media/posts/:postId',
    { schema: GetSocialMediaPostSchema, onRequest: [authGuard] },
    asyncWrapper(getSocialMediaPost)
  );

  app.delete(
    '/social-media/posts/:postId',
    { schema: GetSocialMediaPostSchema, onRequest: [authGuard] },
    asyncWrapper(deleteSocialMediaPost)
  );

  app.patch(
    '/social-media/posts/:postId',
    { schema: PostToSocialMediaSchema, onRequest: [authGuard] },
    asyncWrapper(updateSocialMediaPost)
  );

  app.post(
    '/social-media/validate',
    { schema: PostToSocialMediaSchema, onRequest: [authGuard] },
    asyncWrapper(validateSocialMediaPayload)
  );

  app.get(
    '/social-media/posts',
    { schema: ListSocialMediaPostsSchema, onRequest: [authGuard] },
    asyncWrapper(getAllSocialMediaPosts)
  );

  app.get(
    '/social-media/user/posts',
    { schema: ListUserSocialMediaPostsSchema, onRequest: [authGuard] },
    asyncWrapper(getUserSocialMediaPosts)
  );

  app.get(
    '/social-media/posts/:postId/publish',
    {
      schema: {
        params: PublishScheduledPostSchema.params,
        response: PublishScheduledPostSchema.response,
      },
      onRequest: [authGuard],
    },
    asyncWrapper(publishScheduledPostNow)
  );

  app.post(
    '/social-media/posts/:postId/repost',
    { schema: RepostSocialMediaPostSchema, onRequest: [authGuard] },
    asyncWrapper(repostSocialMediaPost)
  );
}
