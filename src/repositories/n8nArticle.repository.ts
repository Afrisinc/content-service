/**
 * N8N Article Repository
 * Handles database operations for N8N articles
 */

import { prisma } from '@/database/prismaClient';
import { calculateOffset } from '@/utils/pagination';
import { Prisma } from '@prisma/client';

export interface NewsDeskListParams {
  status?: string;
  category?: string;
  search?: string;
  page: number;
  limit: number;
}

const DESK_MEDIA_POST_SUMMARY = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  cover_image: true,
  status: true,
  published_at: true,
} satisfies Prisma.MediaPostSelect;

function deskWhere(params: NewsDeskListParams): Prisma.N8nArticleWhereInput {
  const where: Prisma.N8nArticleWhereInput = {};

  if (params.status) {
    where.status = params.status;
  }
  if (params.category) {
    where.category = { equals: params.category, mode: 'insensitive' };
  }
  if (params.search) {
    where.OR = [
      { source_headline: { contains: params.search, mode: 'insensitive' } },
      { source_summary: { contains: params.search, mode: 'insensitive' } },
      { creator: { contains: params.search, mode: 'insensitive' } },
      { mediaPosts: { some: { title: { contains: params.search, mode: 'insensitive' } } } },
    ];
  }

  return where;
}

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

  async findExistingGuids(guids: string[]): Promise<Set<string>> {
    if (guids.length === 0) {
      return new Set();
    }
    const rows = await prisma.n8nArticle.findMany({
      where: { guid: { in: guids } },
      select: { guid: true },
    });
    return new Set(rows.map(row => row.guid));
  }

  /** `skipDuplicates` absorbs a GUID another run inserted between the check and the write. */
  async createIngested(rows: Prisma.N8nArticleCreateManyInput[]): Promise<number> {
    if (rows.length === 0) {
      return 0;
    }
    const result = await prisma.n8nArticle.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  }

  /**
   * Moves up to `limit` drafts to `processing`, oldest first. Each claim is a
   * conditional update, so two runs racing for the same article cannot both win.
   */
  async claimForEnhancement(limit: number) {
    const candidates = await prisma.n8nArticle.findMany({
      where: { status: 'draft' },
      orderBy: { created_at: 'asc' },
      take: limit,
      select: { id: true },
    });

    const claimed = [];
    for (const { id } of candidates) {
      const { count } = await prisma.n8nArticle.updateMany({
        where: { id, status: 'draft' },
        data: { status: 'processing', processing_error: null },
      });
      if (count === 1) {
        const article = await prisma.n8nArticle.findUnique({ where: { id } });
        if (article) {
          claimed.push(article);
        }
      }
    }
    return claimed;
  }

  async failOrphaned(processingBefore: Date, reason: string): Promise<number> {
    const { count } = await prisma.n8nArticle.updateMany({
      where: { status: 'processing', updated_at: { lt: processingBefore } },
      data: { status: 'failed', processing_error: reason },
    });
    return count;
  }

  async isSlugTaken(slug: string, articleId: bigint): Promise<boolean> {
    const [post, article] = await Promise.all([
      prisma.mediaPost.findUnique({ where: { slug }, select: { id: true } }),
      prisma.n8nArticle.findFirst({
        where: { slug, NOT: { id: articleId } },
        select: { id: true },
      }),
    ]);
    return Boolean(post || article);
  }

  async publishEnhanced(
    articleId: bigint,
    mediaPost: Prisma.MediaPostUncheckedCreateInput,
    article: Prisma.N8nArticleUpdateInput
  ) {
    const [created] = await prisma.$transaction([
      prisma.mediaPost.create({ data: mediaPost }),
      prisma.n8nArticle.update({ where: { id: articleId }, data: article }),
    ]);
    return created;
  }

  async listForDesk(params: NewsDeskListParams) {
    const where = deskWhere(params);

    const [articles, total] = await Promise.all([
      prisma.n8nArticle.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: calculateOffset(params.page, params.limit),
        take: params.limit,
        include: {
          mediaPosts: {
            orderBy: { created_at: 'desc' },
            take: 1,
            select: DESK_MEDIA_POST_SUMMARY,
          },
          _count: { select: { generatedPosts: true } },
        },
      }),
      prisma.n8nArticle.count({ where }),
    ]);

    return { articles, total };
  }

  async latestIngestedAt(): Promise<Date | null> {
    const latest = await prisma.n8nArticle.aggregate({ _max: { created_at: true } });
    return latest._max.created_at;
  }

  async deskStatusTotals() {
    return prisma.n8nArticle.groupBy({
      by: ['status'],
      _count: { _all: true },
      _sum: { viewCount: true, readCount: true },
    });
  }

  async countStuck(processingBefore: Date) {
    return prisma.n8nArticle.count({
      where: { status: 'processing', updated_at: { lt: processingBefore } },
    });
  }

  async findDeskDetail(id: bigint) {
    return prisma.n8nArticle.findUnique({
      where: { id },
      include: {
        mediaPosts: {
          orderBy: { created_at: 'desc' },
          take: 1,
          select: {
            ...DESK_MEDIA_POST_SUMMARY,
            content: true,
            cover_alt: true,
            tags: true,
            read_time: true,
            word_count: true,
            ai_provider: true,
            ai_model: true,
            source_name: true,
            views: true,
            shares: true,
            read_completions: true,
          },
        },
        generatedPosts: {
          orderBy: { created_at: 'desc' },
          take: 20,
          select: {
            id: true,
            platform: true,
            status: true,
            error_message: true,
            fb_url: true,
            insta_url: true,
            twitter_url: true,
            linkedin_url: true,
            whatsapp_sent_at: true,
            published_at: true,
            created_at: true,
          },
        },
      },
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
