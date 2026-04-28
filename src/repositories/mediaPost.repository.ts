/**
 * MediaPost Repository
 * Database operations for media posts
 */

import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from '@/database/prismaClient';
import { CreateMediaPostPayload, UpdateMediaPostPayload, MediaPostQueryParams } from '@/types/mediaPost.types';

export class MediaPostRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Create a new media post
   */
  async create(data: CreateMediaPostPayload) {
    return this.prisma.mediaPost.create({
      data: {
        title: data.title,
        content: data.content,
        slug: data.slug,
        excerpt: data.excerpt,
        cover_image: data.cover_image,
        cover_alt: data.cover_alt,
        media_type: data.media_type,
        video_url: data.video_url,
        video_poster: data.video_poster,
        video_duration: data.video_duration,
        media_urls: data.media_urls || [],
        category: data.category,
        tags: data.tags || [],
        topic: data.topic,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        canonical_url: data.canonical_url,
        og_title: data.og_title,
        og_description: data.og_description,
        og_image: data.og_image,
        twitter_card: data.twitter_card || 'summary_large_image',
        twitter_title: data.twitter_title,
        twitter_description: data.twitter_description,
        status: data.status || 'DRAFT',
        is_featured: data.is_featured || false,
        is_breaking: data.is_breaking || false,
        is_sponsored: data.is_sponsored || false,
        sponsor_name: data.sponsor_name,
        sponsor_url: data.sponsor_url,
        published_at: data.published_at,
        scheduled_at: data.scheduled_at,
        read_time: data.read_time || 3,
        language: data.language || 'en',
        word_count: data.word_count,
        ai_generated: data.ai_generated || false,
        ai_provider: data.ai_provider,
        ai_model: data.ai_model,
        ai_prompt: data.ai_prompt,
        ai_score: data.ai_score,
        source_url: data.source_url,
        source_name: data.source_name,
        in_newsletter: data.in_newsletter || false,
        rss_guid: data.rss_guid,
        authorId: data.authorId,
        n8nArticleId: data.n8nArticleId,
      },
    });
  }

  /**
   * Get media post by ID
   */
  async getById(id: string) {
    return this.prisma.mediaPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        n8nArticle: {
          select: {
            id: true,
            source_headline: true,
            source_url: true,
          },
        },
        socialPosts: {
          select: {
            id: true,
            platform: true,
            postUrl: true,
            status: true,
          },
        },
      },
    });
  }

  /**
   * Get media post by slug
   */
  async getBySlug(slug: string) {
    return this.prisma.mediaPost.findUnique({
      where: { slug },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Get paginated media posts with filters
   */
  async getPaginated(params: MediaPostQueryParams) {
    const {
      page = 1,
      limit = 10,
      status,
      category,
      topic,
      is_featured,
      is_breaking,
      ai_generated,
      in_newsletter,
      search,
      sortBy = 'published_at',
      sortOrder = 'desc',
    } = params;

    const skip = (page - 1) * limit;

    const where: Prisma.MediaPostWhereInput = {
      ...(status && { status }),
      ...(category && { category }),
      ...(topic && { topic }),
      ...(is_featured !== undefined && { is_featured }),
      ...(is_breaking !== undefined && { is_breaking }),
      ...(ai_generated !== undefined && { ai_generated }),
      ...(in_newsletter !== undefined && { in_newsletter }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' } },
          { excerpt: { contains: search, mode: 'insensitive' } },
          { content: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.MediaPostOrderByWithRelationInput = {
      [sortBy]: sortOrder,
    };

    const [posts, total] = await Promise.all([
      this.prisma.mediaPost.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          author: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.mediaPost.count({ where }),
    ]);

    return {
      posts,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Update media post
   */
  async update(id: string, data: UpdateMediaPostPayload) {
    return this.prisma.mediaPost.update({
      where: { id },
      data: {
        title: data.title,
        content: data.content,
        excerpt: data.excerpt,
        cover_image: data.cover_image,
        cover_alt: data.cover_alt,
        media_type: data.media_type,
        video_url: data.video_url,
        video_poster: data.video_poster,
        video_duration: data.video_duration,
        media_urls: data.media_urls,
        category: data.category,
        tags: data.tags,
        topic: data.topic,
        meta_title: data.meta_title,
        meta_description: data.meta_description,
        canonical_url: data.canonical_url,
        og_title: data.og_title,
        og_description: data.og_description,
        og_image: data.og_image,
        twitter_card: data.twitter_card,
        twitter_title: data.twitter_title,
        twitter_description: data.twitter_description,
        status: data.status,
        is_featured: data.is_featured,
        is_breaking: data.is_breaking,
        is_sponsored: data.is_sponsored,
        sponsor_name: data.sponsor_name,
        sponsor_url: data.sponsor_url,
        published_at: data.published_at,
        scheduled_at: data.scheduled_at,
        read_time: data.read_time,
        language: data.language,
        word_count: data.word_count,
        ai_generated: data.ai_generated,
        ai_provider: data.ai_provider,
        ai_model: data.ai_model,
        ai_prompt: data.ai_prompt,
        ai_score: data.ai_score,
        source_url: data.source_url,
        source_name: data.source_name,
        in_newsletter: data.in_newsletter,
        rss_guid: data.rss_guid,
        updated_at: new Date(),
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Delete media post
   */
  async delete(id: string) {
    return this.prisma.mediaPost.delete({
      where: { id },
    });
  }

  /**
   * Soft delete - archive media post
   */
  async archive(id: string) {
    return this.prisma.mediaPost.update({
      where: { id },
      data: {
        status: 'ARCHIVED',
        updated_at: new Date(),
      },
    });
  }

  /**
   * Get featured posts
   */
  async getFeatured(limit: number = 10) {
    return this.prisma.mediaPost.findMany({
      where: {
        is_featured: true,
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
      include: {
        author: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  /**
   * Get breaking news posts
   */
  async getBreaking(limit: number = 5) {
    return this.prisma.mediaPost.findMany({
      where: {
        is_breaking: true,
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Get posts by category
   */
  async getByCategory(category: string, limit: number = 10) {
    return this.prisma.mediaPost.findMany({
      where: {
        category,
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Get posts by topic
   */
  async getByTopic(topic: string, limit: number = 10) {
    return this.prisma.mediaPost.findMany({
      where: {
        topic,
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Search media posts
   */
  async search(query: string, limit: number = 20) {
    return this.prisma.mediaPost.findMany({
      where: {
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { excerpt: { contains: query, mode: 'insensitive' } },
          { tags: { has: query } },
        ],
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Get AI-generated posts
   */
  async getAiGenerated(limit: number = 10) {
    return this.prisma.mediaPost.findMany({
      where: {
        ai_generated: true,
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Get posts for newsletter
   */
  async getForNewsletter(limit: number = 10) {
    return this.prisma.mediaPost.findMany({
      where: {
        in_newsletter: true,
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Get posts with video media
   */
  async getVideoArticles(limit: number = 10) {
    return this.prisma.mediaPost.findMany({
      where: {
        media_type: 'video',
        status: 'PUBLISHED',
      },
      take: limit,
      orderBy: {
        published_at: 'desc',
      },
    });
  }

  /**
   * Increment view count
   */
  async incrementViews(id: string) {
    return this.prisma.mediaPost.update({
      where: { id },
      data: {
        views: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Increment share count
   */
  async incrementShares(id: string) {
    return this.prisma.mediaPost.update({
      where: { id },
      data: {
        shares: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Get statistics
   */
  async getStats() {
    const [total, published, draft, scheduled, archived, featured, breaking, totalViews, totalShares] =
      await Promise.all([
        this.prisma.mediaPost.count(),
        this.prisma.mediaPost.count({ where: { status: 'PUBLISHED' } }),
        this.prisma.mediaPost.count({ where: { status: 'DRAFT' } }),
        this.prisma.mediaPost.count({ where: { status: 'SCHEDULED' } }),
        this.prisma.mediaPost.count({ where: { status: 'ARCHIVED' } }),
        this.prisma.mediaPost.count({ where: { is_featured: true } }),
        this.prisma.mediaPost.count({ where: { is_breaking: true } }),
        this.prisma.mediaPost.aggregate({
          _sum: { views: true },
        }),
        this.prisma.mediaPost.aggregate({
          _sum: { shares: true },
        }),
      ]);

    const allPosts = await this.prisma.mediaPost.findMany({
      select: { read_time: true },
    });

    const averageReadTime =
      allPosts.length > 0 ? allPosts.reduce((sum, p) => sum + (p.read_time || 0), 0) / allPosts.length : 0;

    return {
      totalPosts: total,
      publishedPosts: published,
      draftPosts: draft,
      scheduledPosts: scheduled,
      archivedPosts: archived,
      featuredPosts: featured,
      breakingPosts: breaking,
      totalViews: totalViews._sum.views || 0,
      totalShares: totalShares._sum.shares || 0,
      averageReadTime: Math.round(averageReadTime * 100) / 100,
    };
  }

  /**
   * Bulk update status
   */
  async bulkUpdateStatus(ids: string[], status: string) {
    return this.prisma.mediaPost.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        status: status as any,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Bulk toggle feature
   */
  async bulkToggleFeature(ids: string[], featured: boolean) {
    return this.prisma.mediaPost.updateMany({
      where: {
        id: { in: ids },
      },
      data: {
        is_featured: featured,
        updated_at: new Date(),
      },
    });
  }

  /**
   * Bulk delete
   */
  async bulkDelete(ids: string[]) {
    return this.prisma.mediaPost.deleteMany({
      where: {
        id: { in: ids },
      },
    });
  }

  /**
   * Check if slug exists
   */
  async slugExists(slug: string, excludeId?: string) {
    const post = await this.prisma.mediaPost.findUnique({
      where: { slug },
    });

    if (!post) {
      return false;
    }
    if (excludeId && post.id === excludeId) {
      return false;
    }
    return true;
  }
}
