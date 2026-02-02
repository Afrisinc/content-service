/**
 * N8N Articles Routes
 * Defines routes for N8N articles endpoints
 */

import { getAllArticles, getArticleById, getArticlesByCategory } from '@/controllers/n8nArticles.controller';
import {
  GetAllArticlesSchema,
  GetArticleByIdSchema,
  GetArticlesByCategorySchema,
} from '@/schemas/requests/n8nArticles.schema';
import { FastifyInstance } from 'fastify';

export async function ArticlesRoutes(fastify: FastifyInstance) {
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
}
