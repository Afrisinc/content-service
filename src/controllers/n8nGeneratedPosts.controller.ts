/**
 * N8N Generated Posts Controller
 * Handles HTTP requests for N8N generated posts
 */

import { createError } from '@/middlewares/errorHandler';
import { n8nGeneratedPostRepository } from '@/repositories/n8nGeneratedPost.repository';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { logger } from '@/utils/logger';
import { buildPaginatedResponse, parsePagination } from '@/utils/pagination';
import { FastifyReply, FastifyRequest } from 'fastify';
import { Prisma } from '@prisma/client';

/**
 * Get all generated posts with pagination
 */
export async function getAllGeneratedPosts(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = request.query as { page?: string; limit?: string };
  const { page, limit } = parsePagination({ page: query.page, limit: query.limit }, 10, 100);

  logger.info(
    {
      page,
      limit,
    },
    'Fetching all generated posts'
  );

  const { posts, total } = await n8nGeneratedPostRepository.findAll(page, limit);
  const response = buildPaginatedResponse(posts, total, page, limit);

  return ApiResponseHelper.success(reply, 'Generated posts fetched successfully', response, ResponseCode.SUCCESS, 200);
}

/**
 * Get generated posts by status with pagination
 */
export async function getGeneratedPostsByStatus(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { status: string };
  const query = request.query as { page?: string; limit?: string };
  const { page, limit } = parsePagination({ page: query.page, limit: query.limit }, 10, 100);

  if (!params.status || !params.status.trim()) {
    throw createError.badRequest('Status parameter is required');
  }

  logger.info(
    {
      status: params.status,
      page,
      limit,
    },
    'Fetching generated posts by status'
  );

  const { posts, total } = await n8nGeneratedPostRepository.findByStatus(params.status, page, limit);
  const response = buildPaginatedResponse(posts, total, page, limit);

  return ApiResponseHelper.success(
    reply,
    `Generated posts with status "${params.status}" fetched successfully`,
    response,
    ResponseCode.SUCCESS,
    200
  );
}

/**
 * Get generated post by ID
 */
export async function getGeneratedPostById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { id: string };

  if (!params.id) {
    throw createError.badRequest('Post ID is required');
  }

  const id = BigInt(params.id);

  logger.info(
    {
      id: id.toString(),
    },
    'Fetching generated post by ID'
  );

  const post = await n8nGeneratedPostRepository.findById(id);
  if (!post) {
    throw createError.notFound(`Generated post with ID ${id} not found`);
  }

  return ApiResponseHelper.success(reply, 'Generated post fetched successfully', post, ResponseCode.SUCCESS, 200);
}

/**
 * Create a new generated post
 */
export async function createGeneratedPost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = request.body as Prisma.N8nGeneratedPostCreateInput;

  if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
    throw createError.badRequest('Request body is required');
  }

  logger.info(
    {
      platform: body.platform,
      topic: body.topic,
    },
    'Creating new generated post'
  );

  const post = await n8nGeneratedPostRepository.create(body);

  return ApiResponseHelper.success(reply, 'Generated post created successfully', post, ResponseCode.SUCCESS, 201);
}

/**
 * Update a generated post
 */
export async function updateGeneratedPost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { id: string };
  const body = request.body as Prisma.N8nGeneratedPostUpdateInput;

  if (!params.id) {
    throw createError.badRequest('Post ID is required');
  }

  if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
    throw createError.badRequest('Request body is required');
  }

  const id = BigInt(params.id);

  logger.info(
    {
      id: id.toString(),
    },
    'Updating generated post'
  );

  const post = await n8nGeneratedPostRepository.update(id, body);

  return ApiResponseHelper.success(reply, 'Generated post updated successfully', post, ResponseCode.SUCCESS, 200);
}

/**
 * Delete a generated post
 */
export async function deleteGeneratedPost(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { id: string };

  if (!params.id) {
    throw createError.badRequest('Post ID is required');
  }

  const id = BigInt(params.id);

  logger.info(
    {
      id: id.toString(),
    },
    'Deleting generated post'
  );

  const post = await n8nGeneratedPostRepository.delete(id);

  return ApiResponseHelper.success(reply, 'Generated post deleted successfully', post, ResponseCode.SUCCESS, 200);
}

/**
 * Get generated posts by platform with pagination
 */
export async function getGeneratedPostsByPlatform(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { platform: string };
  const query = request.query as { page?: string; limit?: string };
  const { page, limit } = parsePagination({ page: query.page, limit: query.limit }, 10, 100);

  if (!params.platform || !params.platform.trim()) {
    throw createError.badRequest('Platform parameter is required');
  }

  logger.info(
    {
      platform: params.platform,
      page,
      limit,
    },
    'Fetching generated posts by platform'
  );

  const { posts, total } = await n8nGeneratedPostRepository.findByPlatform(params.platform, page, limit);
  const response = buildPaginatedResponse(posts, total, page, limit);

  return ApiResponseHelper.success(
    reply,
    `Generated posts for platform "${params.platform}" fetched successfully`,
    response,
    ResponseCode.SUCCESS,
    200
  );
}
