/**
 * Social Media Post Repository
 * Database operations for social media posts
 */

import { PostFormat, PrismaClient } from '@prisma/client';
import { prisma } from '@/database/prismaClient';

export class SocialMediaPostRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Create a new social media post record
   */
  async createPost(data: {
    userId: string;
    platform: string;
    pageId: string;
    message?: string;
    link?: string;
    description?: string;
    picture?: string;
    name?: string;
    caption?: string;
    tags?: string[];
    postFormat?: PostFormat;
    mediaType?: string;
    mediaUrls?: string[];
    altText?: string;
    scheduledAt?: Date;
    ageMin?: number;
    ageMax?: number;
    genders?: number[];
    countries?: string[];
    regions?: string[];
    cities?: string[];
    interests?: string[];
    keywords?: string[];
    aiGenerated?: boolean;
    aiProvider?: string;
    aiModel?: string;
    aiPrompt?: string;
    status?: string;
    accessTokenEnc?: string;
    metadata?: string;
  }) {
    return this.prisma.socialMediaPost.create({
      data: {
        ...data,
        status: data.status || 'pending',
      },
    });
  }

  /**
   * Update post with platform-specific data after publishing
   */
  async updatePostAfterPublish(
    postId: string,
    data: {
      platformPostId: string;
      postUrl?: string;
      publishedAt: Date;
      status: string;
    }
  ) {
    return this.prisma.socialMediaPost.update({
      where: { id: postId },
      data: {
        postId: data.platformPostId,
        postUrl: data.postUrl,
        publishedAt: data.publishedAt,
        status: data.status,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Update post status to failed with error message
   */
  async markPostFailed(postId: string, errorMessage: string) {
    return this.prisma.socialMediaPost.update({
      where: { id: postId },
      data: {
        status: 'failed',
        errorMessage,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get post by ID
   */
  async getPostById(postId: string) {
    return this.prisma.socialMediaPost.findUnique({
      where: { id: postId },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Find post by ID (alias for getPostById)
   */
  async findById(postId: string) {
    return this.getPostById(postId);
  }

  /**
   * Get all posts with optional filters
   */
  async getAllPosts(options?: {
    platform?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = {};

    if (options?.platform) {
      where.platform = options.platform;
    }

    if (options?.status) {
      where.status = options.status;
    }

    const [posts, total] = await Promise.all([
      this.prisma.socialMediaPost.findMany({
        where,
        skip: options?.offset || 0,
        take: options?.limit || 50,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.socialMediaPost.count({ where }),
    ]);

    // Log raw Prisma response
    console.log('🔍 PRISMA RAW RESPONSE:', {
      postsCount: posts.length,
      firstPostRaw: posts[0],
      firstPostKeys: posts[0] ? Object.keys(posts[0]) : [],
    });

    return {
      posts,
      total,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    };
  }

  /**
   * Get all posts by user
   */
  async getPostsByUser(
    userId: string,
    options?: {
      platform?: string;
      status?: string;
      limit?: number;
      offset?: number;
    }
  ) {
    const where: any = { userId };

    if (options?.platform) {
      where.platform = options.platform;
    }

    if (options?.status) {
      where.status = options.status;
    }

    const [posts, total] = await Promise.all([
      this.prisma.socialMediaPost.findMany({
        where,
        skip: options?.offset || 0,
        take: options?.limit || 50,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      this.prisma.socialMediaPost.count({ where }),
    ]);

    return {
      posts,
      total,
      limit: options?.limit || 50,
      offset: options?.offset || 0,
    };
  }

  /**
   * Get published posts by user
   */
  async getPublishedPostsByUser(userId: string, limit = 50, offset = 0) {
    return this.prisma.socialMediaPost.findMany({
      where: {
        userId,
        status: 'published',
      },
      skip: offset,
      take: limit,
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * Get AI-generated posts
   */
  async getAIGeneratedPosts(userId: string, limit = 50, offset = 0) {
    return this.prisma.socialMediaPost.findMany({
      where: {
        userId,
        aiGenerated: true,
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get posts by platform
   */
  async getPostsByPlatform(userId: string, platform: string, limit = 50, offset = 0) {
    return this.prisma.socialMediaPost.findMany({
      where: {
        userId,
        platform,
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get scheduled posts
   */
  async getScheduledPosts(userId: string) {
    return this.prisma.socialMediaPost.findMany({
      where: {
        userId,
        status: 'pending',
        scheduledAt: {
          not: null,
        },
      },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  /**
   * Get posts ready to publish (scheduled time passed)
   */
  async getPostsReadyToPublish() {
    return this.prisma.socialMediaPost.findMany({
      where: {
        status: 'pending',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: 'asc' },
      include: {
        user: true,
      },
    });
  }

  /**
   * Update post with engagement metrics
   */
  async updatePostMetrics(
    postId: string,
    metrics: {
      likes?: number;
      comments?: number;
      shares?: number;
      views?: number;
      reach?: number;
      impressions?: number;
    }
  ) {
    return this.prisma.socialMediaPost.update({
      where: { id: postId },
      data: {
        ...metrics,
        lastMetricsUpdate: new Date(),
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get posts with low engagement
   */
  async getPostsWithLowEngagement(userId: string, minDaysOld = 7) {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - minDaysOld);

    return this.prisma.socialMediaPost.findMany({
      where: {
        userId,
        status: 'published',
        publishedAt: {
          lte: daysAgo,
        },
        likes: {
          lt: 10,
        },
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  /**
   * Get top performing posts
   */
  async getTopPerformingPosts(userId: string, limit = 10) {
    return this.prisma.socialMediaPost.findMany({
      where: { userId, status: 'published' },
      orderBy: [{ likes: 'desc' }, { comments: 'desc' }, { shares: 'desc' }],
      take: limit,
    });
  }

  /**
   * Update post (for pending posts)
   */
  async updatePost(
    postId: string,
    data: {
      message?: string;
      link?: string;
      description?: string;
      caption?: string;
      postFormat?: PostFormat;
      mediaUrls?: string[];
      mediaType?: string;
      altText?: string;
      tags?: string[];
      scheduledAt?: Date | null;
    }
  ) {
    return this.prisma.socialMediaPost.update({
      where: { id: postId },
      data: {
        ...data,
        updatedAt: new Date(),
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            name: true,
          },
        },
      },
    });
  }

  /**
   * Bulk status change for posts held in review. `getPostsReadyToPublish` only ever
   * looks at `pending`, so anything in another status is invisible to the cron.
   */
  async setStatusForPosts(postIds: string[], status: string) {
    if (!postIds.length) {
      return { count: 0 };
    }
    return this.prisma.socialMediaPost.updateMany({
      where: { id: { in: postIds } },
      data: { status, updatedAt: new Date() },
    });
  }

  async reschedulePosts(postIds: string[], scheduledAt: Date) {
    if (!postIds.length) {
      return { count: 0 };
    }
    return this.prisma.socialMediaPost.updateMany({
      where: { id: { in: postIds } },
      data: { scheduledAt, updatedAt: new Date() },
    });
  }

  /**
   * Delete post (hard delete - actually removes from database)
   */
  async deletePost(postId: string) {
    return this.prisma.socialMediaPost.delete({
      where: { id: postId },
    });
  }

  /**
   * Get analytics for post
   *
   * A post now carries one row per day, so this returns the most recent day.
   * `getPostAnalyticsHistory` returns the series.
   */
  async getPostAnalytics(postId: string) {
    return this.prisma.socialMediaAnalytics.findFirst({
      where: { postId },
      orderBy: { date: 'desc' },
    });
  }

  /** Every day recorded for a post, oldest first, for trend reporting. */
  async getPostAnalyticsHistory(postId: string, limit = 60) {
    return this.prisma.socialMediaAnalytics.findMany({
      where: { postId },
      orderBy: { date: 'asc' },
      take: limit,
    });
  }

  /**
   * Create or update post analytics
   */
  async upsertAnalytics(
    postId: string,
    data: {
      date: Date;
      platform: string;
      impressions?: number;
      reaches?: number;
      engagements?: number;
      clicks?: number;
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
      views?: number;
      topCountries?: string[];
      topCities?: string[];
      genderBreakdown?: string[];
      ageBreakdown?: string[];
    }
  ) {
    return this.prisma.socialMediaAnalytics.upsert({
      where: { postId_date: { postId, date: data.date } },
      update: {
        ...data,
        updatedAt: new Date(),
      },
      create: {
        postId,
        ...data,
      },
    });
  }

  /**
   * Get user's account configurations
   */
  async getUserAccounts(userId: string) {
    return this.prisma.socialMediaAccount.findMany({
      where: {
        userId,
        isActive: true,
      },
    });
  }

  /**
   * Get specific account configuration
   */
  async getAccount(userId: string, platform: string, pageId: string) {
    return this.prisma.socialMediaAccount.findUnique({
      where: {
        userId_platform_pageId: {
          userId,
          platform,
          pageId,
        },
      },
    });
  }

  /**
   * Create account configuration
   */
  async createAccount(data: {
    userId: string;
    platform: string;
    pageId: string;
    pageeName?: string;
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }) {
    return this.prisma.socialMediaAccount.create({
      data,
    });
  }

  /**
   * Update account configuration
   */
  async updateAccount(
    userId: string,
    platform: string,
    pageId: string,
    data: {
      accessToken?: string;
      refreshToken?: string;
      expiresAt?: Date;
      isActive?: boolean;
    }
  ) {
    return this.prisma.socialMediaAccount.update({
      where: {
        userId_platform_pageId: {
          userId,
          platform,
          pageId,
        },
      },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Get statistics for user's posts
   */
  async getUserPostStats(userId: string) {
    const totalPosts = await this.prisma.socialMediaPost.count({
      where: { userId },
    });

    const publishedPosts = await this.prisma.socialMediaPost.count({
      where: { userId, status: 'published' },
    });

    const failedPosts = await this.prisma.socialMediaPost.count({
      where: { userId, status: 'failed' },
    });

    const aiGeneratedPosts = await this.prisma.socialMediaPost.count({
      where: { userId, aiGenerated: true },
    });

    const aggregates = await this.prisma.socialMediaPost.aggregate({
      where: { userId, status: 'published' },
      _sum: {
        likes: true,
        comments: true,
        shares: true,
        views: true,
      },
    });

    return {
      totalPosts,
      publishedPosts,
      failedPosts,
      aiGeneratedPosts,
      totalEngagement: {
        likes: aggregates._sum.likes || 0,
        comments: aggregates._sum.comments || 0,
        shares: aggregates._sum.shares || 0,
        views: aggregates._sum.views || 0,
      },
    };
  }

  /**
   * Get posts by date range
   */
  async getPostsByDateRange(
    userId: string,
    startDate: Date,
    endDate: Date,
    limit = 100,
    offset = 0
  ) {
    return this.prisma.socialMediaPost.findMany({
      where: {
        userId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      skip: offset,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }
}

export const socialMediaPostRepository = new SocialMediaPostRepository();
