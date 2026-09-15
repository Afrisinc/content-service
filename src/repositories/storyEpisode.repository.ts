import { prisma } from '@/database/prismaClient';
import { Prisma, PrismaClient, StoryEpisodeStatus } from '@prisma/client';

export interface CreateStoryEpisodeInput {
  storyId: string;
  episodeNumber: number;
  idempotencyKey?: string;
  title: string;
  hook: string;
  body: string;
  cliffhanger?: string;
  themes?: string[];
  contentWarnings?: string[];
  wordCount: number;
  promotionCaption?: string;
  promotionHashtags?: string[];
  llmProvider: string;
  llmAttempts: number;
  status?: StoryEpisodeStatus;
  metadata?: Prisma.InputJsonValue;
}

export interface ListStoryEpisodesParams {
  page?: number;
  limit?: number;
}

const MAX_PAGE_SIZE = 100;

export class StoryEpisodeRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async create(data: CreateStoryEpisodeInput) {
    return this.prisma.storyEpisode.create({ data });
  }

  async findById(id: string) {
    return this.prisma.storyEpisode.findUnique({ where: { id } });
  }

  async findByIdInStory(storyId: string, id: string) {
    return this.prisma.storyEpisode.findFirst({ where: { id, storyId } });
  }

  async findByIdempotencyKey(storyId: string, idempotencyKey: string) {
    return this.prisma.storyEpisode.findUnique({
      where: { storyId_idempotencyKey: { storyId, idempotencyKey } },
    });
  }

  async lastForStory(storyId: string) {
    return this.prisma.storyEpisode.findFirst({
      where: { storyId },
      orderBy: { episodeNumber: 'desc' },
    });
  }

  async findByNumber(storyId: string, episodeNumber: number) {
    return this.prisma.storyEpisode.findUnique({
      where: { storyId_episodeNumber: { storyId, episodeNumber } },
    });
  }

  async list(storyId: string, params: ListStoryEpisodesParams = {}) {
    const limit = Math.min(params.limit ?? 20, MAX_PAGE_SIZE);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.StoryEpisodeWhereInput = { storyId };

    const [items, total] = await Promise.all([
      this.prisma.storyEpisode.findMany({
        where,
        orderBy: { episodeNumber: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.storyEpisode.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateStatus(
    id: string,
    status: StoryEpisodeStatus,
    extra: Prisma.StoryEpisodeUpdateInput = {}
  ) {
    return this.prisma.storyEpisode.update({ where: { id }, data: { status, ...extra } });
  }

  /** Public reading surface: never returns a draft, in-review, or failed episode. */
  async findPublishedByNumber(storyId: string, episodeNumber: number) {
    return this.prisma.storyEpisode.findFirst({
      where: { storyId, episodeNumber, status: 'PUBLISHED' },
    });
  }

  async updateContent(
    id: string,
    data: {
      title: string;
      hook: string;
      body: string;
      cliffhanger?: string;
      themes: string[];
      contentWarnings: string[];
      wordCount: number;
      promotionCaption?: string;
      promotionHashtags: string[];
      llmProvider: string;
      llmAttempts: number;
    }
  ) {
    return this.prisma.storyEpisode.update({ where: { id }, data });
  }

  async setPromotionResult(
    id: string,
    result: {
      promotionDraftId?: string;
      promotionStatus: string;
      promotionError?: string | null;
    }
  ) {
    return this.prisma.storyEpisode.update({ where: { id }, data: result });
  }

  /**
   * First view by this device: creates the event and bumps the denormalized
   * viewCount in one transaction. A repeat view from the same device hits the
   * event table's unique constraint and is treated as a no-op, not an error.
   */
  async recordView(deviceId: string, episodeId: string): Promise<void> {
    try {
      await this.prisma.$transaction([
        this.prisma.storyReadEvent.create({ data: { deviceId, episodeId } }),
        this.prisma.storyEpisode.update({
          where: { id: episodeId },
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
   * the denormalized completedReads counter. A second completion ping from the
   * same device (e.g. a re-read) updates completedAt but does not double-count
   * — checked-then-written rather than a single atomic statement, which leaves
   * a narrow race on truly simultaneous pings from the same device; acceptable
   * for a read-analytics counter, not something billed or security-sensitive.
   */
  async recordCompletion(deviceId: string, episodeId: string): Promise<void> {
    const existing = await this.prisma.storyReadEvent.findUnique({
      where: { deviceId_episodeId: { deviceId, episodeId } },
    });

    if (existing?.completed) {
      return;
    }

    await this.prisma.$transaction([
      this.prisma.storyReadEvent.upsert({
        where: { deviceId_episodeId: { deviceId, episodeId } },
        create: { deviceId, episodeId, completed: true, completedAt: new Date() },
        update: { completed: true, completedAt: new Date() },
      }),
      this.prisma.storyEpisode.update({
        where: { id: episodeId },
        data: { completedReads: { increment: 1 } },
      }),
    ]);
  }

  /** Which of these episodes this device has viewed/finished, for "already read" state. */
  async readingStateForDevice(deviceId: string, episodeIds: string[]) {
    if (!episodeIds.length) {
      return [];
    }
    return this.prisma.storyReadEvent.findMany({
      where: { deviceId, episodeId: { in: episodeIds } },
      select: { episodeId: true, completed: true },
    });
  }
}

export const storyEpisodeRepository = new StoryEpisodeRepository();
