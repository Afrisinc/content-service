/**
 * N8N Articles Routes
 * Defines routes for N8N articles endpoints
 */

import {
  checkGuid,
  createArticle,
  getAllArticles,
  getArticleById,
  getArticlesByCategory,
  updateArticle,
} from '@/controllers/n8nArticles.controller';
import {
  CheckGuidSchema,
  CreateArticleSchema,
  GetAllArticlesSchema,
  GetArticleByIdSchema,
  GetArticlesByCategorySchema,
  UpdateArticleSchema,
} from '@/schemas/requests/n8nArticles.schema';
import { FastifyInstance } from 'fastify';

export async function ArticlesRoutes(fastify: FastifyInstance) {
  // Check if article GUID already exists — used by n8n WF1 for deduplication
  // Must be registered BEFORE /articles/:id to avoid route conflict
  fastify.get<{ Querystring: { guid: string } }>(
    '/articles/check-guid',
    {
      schema: CheckGuidSchema,
    },
    checkGuid
  );

  // Ingest a new raw article from RSS feed (n8n WF1 → Save Raw Article node)
  fastify.post<{
    Body: {
      guid: string;
      source_url: string;
      source_headline?: string;
      source_summary?: string;
      pub_date?: string;
      category?: string;
      creator?: string;
      status?: string;
    };
  }>(
    '/articles',
    {
      schema: CreateArticleSchema,
    },
    createArticle
  );

  // Get all articles with search and pagination
  fastify.get<{ Querystring: { search?: string; page?: string; limit?: string } }>(
    '/articles',
    {
      schema: GetAllArticlesSchema,
    },
    getAllArticles
  );

  // Get articles by category
  fastify.get<{ Params: { category: string }; Querystring: { page?: string; limit?: string } }>(
    '/articles/category/:category',
    {
      schema: GetArticlesByCategorySchema,
    },
    getArticlesByCategory
  );

  // Get article by ID
  fastify.get<{ Params: { id: string } }>(
    '/articles/:id',
    {
      schema: GetArticleByIdSchema,
    },
    getArticleById
  );

  // Update article by ID (used by n8n WF2 — no auth required)
  fastify.patch<{
    Params: { id: string };
    Body: {
      status?: string;
      image_url?: string;
      processing_error?: string;
      is_featured?: boolean;
    };
  }>(
    '/articles/:id',
    {
      schema: UpdateArticleSchema,
    },
    updateArticle
  );
}
