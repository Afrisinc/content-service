import { prisma } from '@/database/prismaClient';
import { PostDraftStatus, Prisma, PrismaClient } from '@prisma/client';

export interface CreatePostDraftInput {
  userId: string;
  topic: string;
  format?: string;
  serviceLine?: string;
  offer?: string;
  audience?: string;
  spec: Prisma.InputJsonValue;
  caption?: string;
  hashtags?: string[];
  claims?: string[];
  aiProvider?: string;
  aiModel?: string;
  costMicroUsd?: bigint;
  generationTries?: number;
}

export interface ListPostDraftsParams {
  userId?: string;
  status?: PostDraftStatus;
  format?: string;
  page?: number;
  limit?: number;
}

const MAX_PAGE_SIZE = 100;

export class PostDraftRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async create(data: CreatePostDraftInput) {
    return this.prisma.postDraft.create({ data });
  }

  async findById(id: string) {
    return this.prisma.postDraft.findUnique({ where: { id } });
  }

  async list(params: ListPostDraftsParams) {
    const limit = Math.min(params.limit ?? 20, MAX_PAGE_SIZE);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.PostDraftWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.format ? { format: params.format } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.postDraft.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.postDraft.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  /**
   * How many of these drafts are still waiting on a future slot.
   *
   * Pacing keys off this rather than off "did it run today": a brand posting
   * twice a week should draft about twice a week, or the schedule drifts
   * further into the future with every tick.
   */
  async countScheduledAfter(ids: string[], after: Date): Promise<number> {
    if (!ids.length) {
      return 0;
    }

    return this.prisma.postDraft.count({
      where: {
        id: { in: ids },
        scheduledAt: { gt: after },
        status: { notIn: [PostDraftStatus.rejected, PostDraftStatus.failed] },
      },
    });
  }

  /** Slots already claimed by another draft, so two never land on the same day. */
  async findTakenSlots(after: Date): Promise<Date[]> {
    const rows = await this.prisma.postDraft.findMany({
      where: {
        scheduledAt: { gte: after },
        status: { notIn: [PostDraftStatus.rejected, PostDraftStatus.failed] },
      },
      select: { scheduledAt: true },
      take: 200,
    });
    return rows
      .map((row: { scheduledAt: Date | null }) => row.scheduledAt)
      .filter((slot: Date | null): slot is Date => slot !== null);
  }

  /**
   * Re-point an existing draft at a freshly built spec. A resumed run reuses the
   * draft its failed attempt created rather than leaving an orphan behind.
   */
  async refreshSpec(
    id: string,
    data: {
      spec: Prisma.InputJsonValue;
      caption?: string;
      hashtags?: string[];
      claims?: string[];
    }
  ) {
    return this.prisma.postDraft.update({
      where: { id },
      data: { ...data, errorMessage: null },
    });
  }

  async markQueued(id: string, socialPostIds: string[], scheduledAt: Date) {
    return this.prisma.postDraft.update({
      where: { id },
      data: { socialPostIds, scheduledAt },
    });
  }

  async markRendered(
    id: string,
    data: {
      spec: Prisma.InputJsonValue;
      slideUrls: string[];
      auditReport: Prisma.InputJsonValue;
      auditPassed: boolean;
    }
  ) {
    return this.prisma.postDraft.update({
      where: { id },
      data: {
        ...data,
        status: data.auditPassed ? PostDraftStatus.awaiting_approval : PostDraftStatus.rendered,
        errorMessage: null,
      },
    });
  }

  async approve(id: string, approvedBy: string) {
    return this.prisma.postDraft.update({
      where: { id },
      data: {
        status: PostDraftStatus.approved,
        claimsApproved: true,
        approvedBy,
        approvedAt: new Date(),
      },
    });
  }

  async reject(id: string, reason: string) {
    return this.prisma.postDraft.update({
      where: { id },
      data: { status: PostDraftStatus.rejected, errorMessage: reason },
    });
  }

  async markScheduled(id: string, socialPostIds: string[], scheduledAt: Date) {
    return this.prisma.postDraft.update({
      where: { id },
      data: { status: PostDraftStatus.scheduled, socialPostIds, scheduledAt },
    });
  }

  async markFailed(id: string, errorMessage: string) {
    return this.prisma.postDraft.update({
      where: { id },
      data: { status: PostDraftStatus.failed, errorMessage },
    });
  }
}

export const postDraftRepository = new PostDraftRepository();
