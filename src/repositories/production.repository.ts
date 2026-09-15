import { prisma } from '@/database/prismaClient';
import {
  AnimationMode,
  ApprovalDecision,
  ApprovalStage,
  Prisma,
  PrismaClient,
  ProductionStatus,
  RenderProfile,
  SocialPlatform,
  VariantFormat,
} from '@prisma/client';

export interface CreateProductionInput {
  userId: string;
  idea: string;
  title?: string;
  genre?: string;
  language?: string;
  audience?: string;
  visualStyle?: string;
  narrationStyle?: string;
  animationMode?: AnimationMode;
  targetDurationSeconds?: number;
  platforms?: SocialPlatform[];
  formats?: VariantFormat[];
  contentRestrictions?: string[];
  renderProfile?: RenderProfile;
  autoApprove?: boolean;
  idempotencyKey?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface ListProductionsParams {
  userId?: string;
  status?: ProductionStatus;
  page?: number;
  limit?: number;
}

const MAX_PAGE_SIZE = 100;

export class ProductionRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async create(data: CreateProductionInput) {
    return this.prisma.production.create({ data });
  }

  async findById(id: string) {
    return this.prisma.production.findUnique({ where: { id } });
  }

  async findByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.production.findUnique({ where: { idempotencyKey } });
  }

  async findWithGraph(id: string) {
    return this.prisma.production.findUnique({
      where: { id },
      include: {
        story: true,
        characters: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } },
        environments: { include: { versions: { orderBy: { version: 'desc' }, take: 1 } } },
        props: true,
        scenes: { orderBy: { index: 'asc' }, include: { shots: { orderBy: { index: 'asc' } } } },
        audioTracks: true,
        renderOutputs: true,
        subtitles: true,
        thumbnails: { orderBy: { candidateIndex: 'asc' } },
        variants: true,
        approvals: true,
        qualityChecks: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });
  }

  async list(params: ListProductionsParams) {
    const limit = Math.min(params.limit ?? 20, MAX_PAGE_SIZE);
    const page = Math.max(params.page ?? 1, 1);
    const where: Prisma.ProductionWhereInput = {
      ...(params.userId ? { userId: params.userId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.production.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.production.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async updateStatus(
    id: string,
    status: ProductionStatus,
    extra: Prisma.ProductionUpdateInput = {}
  ) {
    return this.prisma.production.update({ where: { id }, data: { status, ...extra } });
  }

  async markFailed(id: string, stage: string, message: string) {
    return this.prisma.production.update({
      where: { id },
      data: { status: 'FAILED', failedStage: stage, errorMessage: message.slice(0, 1000) },
    });
  }

  async mergeReproducibility(id: string, patch: Record<string, unknown>) {
    const current = await this.prisma.production.findUnique({
      where: { id },
      select: { reproducibility: true },
    });
    const merged = { ...((current?.reproducibility as Record<string, unknown>) ?? {}), ...patch };
    return this.prisma.production.update({
      where: { id },
      data: { reproducibility: merged as Prisma.InputJsonValue },
    });
  }

  async upsertStory(
    productionId: string,
    data: Omit<Prisma.StudioStoryUncheckedCreateInput, 'productionId'>
  ) {
    return this.prisma.studioStory.upsert({
      where: { productionId },
      create: { productionId, ...data },
      update: { ...data, version: { increment: 1 } },
    });
  }

  async getStory(productionId: string) {
    return this.prisma.studioStory.findUnique({ where: { productionId } });
  }

  async recordEvent(data: Prisma.StudioWorkflowEventUncheckedCreateInput) {
    return this.prisma.studioWorkflowEvent.create({ data });
  }

  async events(productionId: string, limit = 200) {
    return this.prisma.studioWorkflowEvent.findMany({
      where: { productionId },
      orderBy: { createdAt: 'asc' },
      take: Math.min(limit, 500),
    });
  }

  async upsertApproval(
    productionId: string,
    stage: ApprovalStage,
    decision: ApprovalDecision,
    decidedBy?: string,
    reason?: string
  ) {
    const decidedAt = decision === 'PENDING' ? null : new Date();
    return this.prisma.studioApproval.upsert({
      where: { productionId_stage: { productionId, stage } },
      create: { productionId, stage, decision, decidedBy, reason, decidedAt },
      update: { decision, decidedBy, reason, decidedAt },
    });
  }

  async approvals(productionId: string) {
    return this.prisma.studioApproval.findMany({ where: { productionId } });
  }
}

export const productionRepository = new ProductionRepository();
