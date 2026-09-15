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
  async findAll(search?: string, page: number = 1, limit: number = 10, status?: string) {
    const offset = calculateOffset(page, limit);
    const where: Prisma.N8nArticleWhereInput = {};

    if (status && status.trim()) {
      where.status = status.trim();
    }

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
  async findByCategory(
    category: string,
    page: number = 1,
    limit: number = 10,
    status: string = 'published'
  ) {
    const offset = calculateOffset(page, limit);

    const where: Prisma.N8nArticleWhereInput = {
      status,
      category: {
        equals: category,
        mode: 'insensitive',
      },
    };

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
   * Find article by ID
   */
  async findById(id: bigint) {
    return prisma.n8nArticle.findUnique({
      where: { id },
    });
  }

  /**
   * Find article by slug (case-insensitive)
   */
  async findBySlug(slug: string) {
    if (!slug || !slug.trim()) {
      return null;
    }

    return prisma.n8nArticle.findFirst({
      where: {
        slug: {
          equals: slug.trim(),
          mode: 'insensitive',
        },
      },
    });
  }

  /**
   * Find article by GUID (used for deduplication check)
   */
  async findByGuid(guid: string) {
    return prisma.n8nArticle.findUnique({
      where: { guid },
    });
  }

  /**
   * Create a new article (RSS ingestion)
   */
  async create(data: Prisma.N8nArticleCreateInput) {
    return prisma.n8nArticle.create({
      data,
    });
  }

  /**
   * Update an article (used by n8n WF2 to update status, image_url, processing_error)
   */
  async update(id: bigint, data: Prisma.N8nArticleUpdateInput) {
    return prisma.n8nArticle.update({
      where: { id },
      data,
    });
  }

  /**
   * First view by this device: creates the event and bumps the denormalized
   * viewCount in one transaction. A repeat view from the same device hits the
   * event table's unique constraint and is treated as a no-op, not an error.
   */
  async recordView(deviceId: string, articleId: bigint): Promise<void> {
    try {
      await prisma.$transaction([
        prisma.articleReadEvent.create({ data: { deviceId, articleId } }),
        prisma.n8nArticle.update({
          where: { id: articleId },
          data: { viewCount: { increment: 1 } },
        }),
      ]);
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return;
      }
      throw err;
    }
  }

  /**
   * First completion by this device: upserts the event as completed and bumps
   * the denormalized readCount. Same benign check-then-write race as the story
   * episode equivalent — acceptable for a read-analytics counter.
   */
  async recordCompletion(deviceId: string, articleId: bigint): Promise<void> {
    const existing = await prisma.articleReadEvent.findUnique({
      where: { deviceId_articleId: { deviceId, articleId } },
    });

    if (existing?.completed) {
      return;
    }

    await prisma.$transaction([
      prisma.articleReadEvent.upsert({
        where: { deviceId_articleId: { deviceId, articleId } },
        create: { deviceId, articleId, completed: true, completedAt: new Date() },
        update: { completed: true, completedAt: new Date() },
      }),
      prisma.n8nArticle.update({ where: { id: articleId }, data: { readCount: { increment: 1 } } }),
    ]);
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
