/**
 * N8N Generated Posts Routes
 * Defines routes for N8N generated posts endpoints
 */

import { FastifyInstance } from 'fastify';
import {
  getAllGeneratedPosts,
  getGeneratedPostById,
  getGeneratedPostsByStatus,
  createGeneratedPost,
  updateGeneratedPost,
  deleteGeneratedPost,
  getGeneratedPostsByPlatform,
} from '@/controllers/n8nGeneratedPosts.controller';
import {
  GetAllGeneratedPostsSchema,
  GetGeneratedPostByIdSchema,
  GetGeneratedPostsByStatusSchema,
  CreateGeneratedPostSchema,
  UpdateGeneratedPostSchema,
  DeleteGeneratedPostSchema,
  GetGeneratedPostsByPlatformSchema,
} from '@/schemas/requests/n8nGeneratedPosts.schema';

export async function GeneratedPostsRoutes(app: FastifyInstance) {
  // Get all generated posts with pagination
  app.get(
    '/generated-posts',
    {
      schema: GetAllGeneratedPostsSchema,
    },
    getAllGeneratedPosts
  );

  // Get generated posts by platform with pagination
  app.get(
    '/generated-posts/platform/:platform',
    {
      schema: GetGeneratedPostsByPlatformSchema,
    },
    getGeneratedPostsByPlatform
  );

  // Get generated posts by status with pagination
  app.get(
    '/generated-posts/status/:status',
    {
      schema: GetGeneratedPostsByStatusSchema,
    },
    getGeneratedPostsByStatus
  );

  // Get a single generated post by ID
  app.get(
    '/generated-posts/:id',
    {
      schema: GetGeneratedPostByIdSchema,
    },
    getGeneratedPostById
  );

  // Create a new generated post
  app.post(
    '/generated-posts',
    {
      schema: CreateGeneratedPostSchema,
    },
    createGeneratedPost
  );

  // Update a generated post
  app.put(
    '/generated-posts/:id',
    {
      schema: UpdateGeneratedPostSchema,
    },
    updateGeneratedPost
  );

  // Delete a generated post
  app.delete(
    '/generated-posts/:id',
    {
      schema: DeleteGeneratedPostSchema,
    },
    deleteGeneratedPost
  );
}
