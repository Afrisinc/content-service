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

const MAX_PAGE_SIZE = 100;

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

    const [items, total] = await Promise.all([
      this.prisma.story.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.story.count({ where }),
    ]);

    return { items, total, page, limit };
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
