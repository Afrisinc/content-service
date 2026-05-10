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
import { Prisma } from '@prisma/client';

/**
 * Check if an article GUID already exists (deduplication for n8n WF1)
 * Returns 200 + { exists: true }  when found (duplicate → skip)
 * Returns 404                      when not found (new → ingest)
 */
export async function checkGuid(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = request.query as { guid?: string };

  if (!query.guid || !query.guid.trim()) {
    throw createError.badRequest('guid query parameter is required');
  }

  const guid = query.guid.trim();

  logger.info({ guid }, 'Checking article GUID existence');

  const article = await n8nArticleRepository.findByGuid(guid);

  if (!article) {
    return ApiResponseHelper.notFound(reply, `Article with GUID "${guid}" not found`);
  }

  return ApiResponseHelper.success(reply, 'Article GUID exists', { exists: true, guid }, ResponseCode.SUCCESS, 200);
}

/**
 * Create (ingest) a new article from an RSS feed (called by n8n WF1)
 * Expects body: { guid, source_url, source_headline?, source_summary?,
 *                 pub_date?, category?, creator?, status? }
 */
export async function createArticle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const body = request.body as {
    guid: string;
    source_url: string;
    source_headline?: string;
    source_summary?: string;
    pub_date?: string;
    category?: string;
    creator?: string;
    status?: string;
  };

  if (!body.guid || !body.guid.trim()) {
    throw createError.badRequest('guid is required');
  }

  if (!body.source_url || !body.source_url.trim()) {
    throw createError.badRequest('source_url is required');
  }

  logger.info(
    {
      guid: body.guid,
      source_url: body.source_url,
      category: body.category,
    },
    'Creating new article from RSS ingestion'
  );

  const data: Prisma.N8nArticleCreateInput = {
    guid: body.guid.trim(),
    source_url: body.source_url.trim(),
    source_headline: body.source_headline?.trim() ?? null,
    source_summary: body.source_summary?.trim() ?? null,
    pub_date: body.pub_date ? new Date(body.pub_date) : null,
    category: body.category?.trim() ?? null,
    creator: body.creator?.trim() ?? null,
    status: body.status ?? 'draft',
  };

  try {
    const article = await n8nArticleRepository.create(data);
    return ApiResponseHelper.created(reply, 'Article ingested successfully', article);
  } catch (error) {
    // Prisma unique constraint violation — guid or source_url already exists
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      logger.warn({ guid: body.guid, source_url: body.source_url }, 'Duplicate article skipped');
      return ApiResponseHelper.duplicate(reply, `Article with this GUID or URL already exists`);
    }
    throw error;
  }
}

/**
 * Get all articles with search and pagination
 */
export async function getAllArticles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = request.query as { search?: string; status?: string; page?: string; limit?: string };
  const { page, limit } = parsePagination({ page: query.page, limit: query.limit }, 10, 100);
  const search = query.search?.trim();
  const status = query.status?.trim();

  logger.info(
    {
      page,
      limit,
      search,
      status,
    },
    'Fetching all articles'
  );

  const { articles, total } = await n8nArticleRepository.findAll(search, page, limit, status);
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

/**
 * Update an article (used by n8n WF2 to update status, image_url, processing_error)
 * PATCH /articles/:id
 */
export async function updateArticle(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const params = request.params as { id: string };
  const body = request.body as {
    status?: string;
    image_url?: string;
    processing_error?: string;
    is_featured?: boolean;
  };

  if (!params.id) {
    throw createError.badRequest('Article ID is required');
  }

  const id = BigInt(params.id);

  // Verify article exists
  const existing = await n8nArticleRepository.findById(id);
  if (!existing) {
    throw createError.notFound(`Article with ID ${id} not found`);
  }

  const data: Prisma.N8nArticleUpdateInput = {};

  if (body.status !== undefined) data.status = body.status;
  if (body.image_url !== undefined) data.image_url = body.image_url;
  if (body.processing_error !== undefined) data.processing_error = body.processing_error;
  if (body.is_featured !== undefined) data.is_featured = body.is_featured;

  logger.info(
    {
      id: id.toString(),
      ...data,
    },
    'Updating article'
  );

  const article = await n8nArticleRepository.update(id, data);

  return ApiResponseHelper.success(reply, 'Article updated successfully', article, ResponseCode.SUCCESS, 200);
}
