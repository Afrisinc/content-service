/**
 * N8N Articles Controller
 * Handles HTTP requests for N8N articles
 */

import { createError } from '@/middlewares/errorHandler';
import { n8nArticleRepository } from '@/repositories/n8nArticle.repository';
import { ApiResponseHelper, ResponseCode } from '@/utils/apiResponse';
import { logger } from '@/utils/logger';
import { buildPaginatedResponse, parsePagination } from '@/utils/pagination';
import { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Get all articles with search and pagination
 */
export async function getAllArticles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = request.query as { search?: string; page?: string; limit?: string };
  const { page, limit } = parsePagination({ page: query.page, limit: query.limit }, 10, 100);
  const search = query.search?.trim();

  logger.info(
    {
      page,
      limit,
      search,
    },
    'Fetching all articles'
  );

  const { articles, total } = await n8nArticleRepository.findAll(search, page, limit);
  const response = buildPaginatedResponse(articles, total, page, limit);

  return ApiResponseHelper.success(reply, 'Articles fetched successfully', response, ResponseCode.SUCCESS, 200);
}

/**
 * Get articles by category with pagination
 */
export async function getArticlesByCategory(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { category: string };
  const query = request.query as { page?: string; limit?: string };
  const { page, limit } = parsePagination({ page: query.page, limit: query.limit }, 10, 100);

  if (!params.category || !params.category.trim()) {
    throw createError.badRequest('Category parameter is required');
  }

  logger.info(
    {
      category: params.category,
      page,
      limit,
    },
    'Fetching articles by category'
  );

  const { articles, total } = await n8nArticleRepository.findByCategory(params.category, page, limit);
  const response = buildPaginatedResponse(articles, total, page, limit);

  return ApiResponseHelper.success(
    reply,
    `Articles in category "${params.category}" fetched successfully`,
    response,
    ResponseCode.SUCCESS,
    200
  );
}

/**
 * Get article by ID
 */
export async function getArticleById(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { id: string };

  if (!params.id) {
    throw createError.badRequest('Article ID is required');
  }

  const id = BigInt(params.id);

  logger.info(
    {
      id: id.toString(),
    },
    'Fetching article by ID'
  );

  const article = await n8nArticleRepository.findById(id);
  if (!article) {
    throw createError.notFound(`Article with ID ${id} not found`);
  }

  return ApiResponseHelper.success(reply, 'Article fetched successfully', article, ResponseCode.SUCCESS, 200);
}
