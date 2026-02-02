/**
 * N8N Article Repository
 * Handles database operations for N8N articles
 */

import { prisma } from '@/database/prismaClient';
import { calculateOffset } from '@/utils/pagination';
import { Prisma } from '@prisma/client';

export class N8nArticleRepository {
  /**
   * Find all articles with search and pagination
   */
  async findAll(search?: string, page: number = 1, limit: number = 10) {
    const offset = calculateOffset(page, limit);
    const where: Prisma.N8nArticleWhereInput = {};

    if (search && search.trim()) {
      where.OR = [
        { source_headline: { contains: search, mode: 'insensitive' } },
        { source_summary: { contains: search, mode: 'insensitive' } },
        { creator: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [articles, total] = await Promise.all([
      prisma.n8nArticle.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.n8nArticle.count({ where }),
    ]);

    return { articles, total };
  }

  /**
   * Find articles by category with pagination
   */
  async findByCategory(category: string, page: number = 1, limit: number = 10) {
    const offset = calculateOffset(page, limit);

    const [articles, total] = await Promise.all([
      prisma.n8nArticle.findMany({
        where: {
          category: {
            equals: category,
            mode: 'insensitive',
          },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.n8nArticle.count({
        where: {
          category: {
            equals: category,
            mode: 'insensitive',
          },
        },
      }),
    ]);

    return { articles, total };
  }

  /**
   * Find article by ID
   */
  async findById(id: bigint) {
    return prisma.n8nArticle.findUnique({
      where: { id },
    });
  }

  /**
   * Get all unique categories
   */
  async getCategories() {
    const categories = await prisma.n8nArticle.findMany({
      distinct: ['category'],
      where: { category: { not: null } },
      select: { category: true },
      orderBy: { category: 'asc' },
    });

    return categories.map(item => item.category).filter(Boolean);
  }
}

export const n8nArticleRepository = new N8nArticleRepository();
