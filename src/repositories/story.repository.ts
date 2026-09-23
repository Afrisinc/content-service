import { prisma } from '@/database/prismaClient';
import { Prisma, PrismaClient, StoryStatus } from '@prisma/client';

export interface CreateStoryInput {
  userId: string;
  title: string;
  premise: string;
  genre?: string;
  language?: string;
  audience?: string;
  tone?: string;
  coverImageUrl?: string;
  /** The brand this story's promo posts go out through — same group Post Studio uses. */
  groupId?: string;
  autoPromote?: boolean;
  autoApprovePromotion?: boolean;
  metadata?: Prisma.InputJsonValue;
}

export interface ListStoriesParams {
  userId?: string;
  status?: StoryStatus;
  page?: number;
  limit?: number;
}

export interface StoryEpisodeTotals {
  episodeCount: number;
  publishedEpisodeCount: number;
  totalViews: number;
  totalReads: number;
}

const MAX_PAGE_SIZE = 100;

const EMPTY_EPISODE_TOTALS: StoryEpisodeTotals = {
  episodeCount: 0,
  publishedEpisodeCount: 0,
  totalViews: 0,
  totalReads: 0,
};

export class StoryRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async create(data: CreateStoryInput) {
    return this.prisma.story.create({ data });
  }

  async findById(id: string) {
    return this.prisma.story.findUnique({ where: { id } });
  }

  async findWithEpisodes(id: string) {
    return this.prisma.story.findUnique({
      where: { id },
      include: { episodes: { orderBy: { episodeNumber: 'asc' } } },
    });
  }

  async list(params: ListStoriesParams) {
    const limit = Math.min(params.limit ?? 20, MAX_PAGE_SIZE);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.StoryWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [stories, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.story.count({ where }),
    ]);

    const totals = await this.episodeTotals(stories.map(story => story.id));
    const items = stories.map(story => ({
      ...story,
      ...(totals.get(story.id) ?? EMPTY_EPISODE_TOTALS),
    }));

    return { items, total, page, limit };
  }

  /** One grouped query for the whole page, so a list never costs a query per story. */
  private async episodeTotals(storyIds: string[]) {
    const totals = new Map<string, StoryEpisodeTotals>();
    if (storyIds.length === 0) {
      return totals;
    }

    const groups = await this.prisma.storyEpisode.groupBy({
      by: ['storyId', 'status'],
      where: { storyId: { in: storyIds } },
      _count: { _all: true },
      _sum: { viewCount: true, completedReads: true },
    });

    for (const group of groups) {
      const current = totals.get(group.storyId) ?? { ...EMPTY_EPISODE_TOTALS };
      current.episodeCount += group._count._all;
      current.totalViews += group._sum.viewCount ?? 0;
      current.totalReads += group._sum.completedReads ?? 0;
      if (group.status === 'PUBLISHED') {
        current.publishedEpisodeCount += group._count._all;
      }
      totals.set(group.storyId, current);
    }

    return totals;
  }

  async updateStatus(id: string, status: StoryStatus) {
    return this.prisma.story.update({ where: { id }, data: { status } });
  }

  /** Public reading surface: only a story with at least one published episode is visible. */
  async listPublished(params: { page?: number; limit?: number }) {
    const limit = Math.min(params.limit ?? 20, MAX_PAGE_SIZE);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.StoryWhereInput = { episodes: { some: { status: 'PUBLISHED' } } };

    const [rows, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { _count: { select: { episodes: { where: { status: 'PUBLISHED' } } } } },
      }),
      this.prisma.story.count({ where }),
    ]);

    const items = rows.map(({ _count, ...story }) => ({
      ...story,
      publishedEpisodeCount: _count.episodes,
    }));

    return { items, total, page, limit };
  }

  /** Public reading surface: only published episodes are attached, never drafts. */
  async findPublishedById(id: string) {
    return this.prisma.story.findFirst({
      where: { id, episodes: { some: { status: 'PUBLISHED' } } },
      include: {
        episodes: { where: { status: 'PUBLISHED' }, orderBy: { episodeNumber: 'asc' } },
      },
    });
  }
}

export const storyRepository = new StoryRepository();
