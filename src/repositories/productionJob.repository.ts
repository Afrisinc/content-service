import { prisma } from '@/database/prismaClient';
import {
  Prisma,
  PrismaClient,
  QualityVerdict,
  RenderProfile,
  SocialPlatform,
  StudioJobStatus,
  SubtitleFormat,
  VariantFormat,
} from '@prisma/client';

export class ProductionJobRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async upsertScene(
    productionId: string,
    sceneId: string,
    data: Omit<Prisma.StudioSceneUncheckedCreateInput, 'productionId' | 'sceneId'>
  ) {
    return this.prisma.studioScene.upsert({
      where: { productionId_sceneId: { productionId, sceneId } },
      create: { productionId, sceneId, ...data },
      update: { ...data, version: { increment: 1 } },
    });
  }

  async replaceShots(sceneId: string, shots: Prisma.StudioShotUncheckedCreateInput[]) {
    return this.prisma.$transaction(async tx => {
      await tx.studioShot.deleteMany({ where: { sceneId } });
      if (shots.length === 0) {
        return [];
      }
      await tx.studioShot.createMany({ data: shots });
      return tx.studioShot.findMany({ where: { sceneId }, orderBy: { index: 'asc' } });
    });
  }

  async scenes(productionId: string) {
    return this.prisma.studioScene.findMany({
      where: { productionId },
      orderBy: { index: 'asc' },
      include: { shots: { orderBy: { index: 'asc' } } },
    });
  }

  async sceneById(id: string) {
    return this.prisma.studioScene.findUnique({ where: { id }, include: { shots: true } });
  }

  async sceneBySceneId(productionId: string, sceneId: string) {
    return this.prisma.studioScene.findUnique({
      where: { productionId_sceneId: { productionId, sceneId } },
      include: { shots: { orderBy: { index: 'asc' } } },
    });
  }

  async setSceneStatus(id: string, status: StudioJobStatus, cacheKey?: string) {
    return this.prisma.studioScene.update({ where: { id }, data: { status, cacheKey } });
  }

  async createRenderJob(data: Prisma.StudioRenderJobUncheckedCreateInput) {
    return this.prisma.studioRenderJob.create({ data });
  }

  async findRenderJobByIdempotencyKey(idempotencyKey: string) {
    return this.prisma.studioRenderJob.findUnique({ where: { idempotencyKey } });
  }

  async findRenderJobByCacheKey(cacheKey: string) {
    return this.prisma.studioRenderJob.findFirst({
      where: { cacheKey, status: 'SUCCEEDED' },
      orderBy: { createdAt: 'desc' },
      include: { outputs: true },
    });
  }

  async startJob(id: string, worker: string) {
    return this.prisma.studioRenderJob.update({
      where: { id },
      data: { status: 'RUNNING', worker, startedAt: new Date(), attempts: { increment: 1 } },
    });
  }

  async completeJob(id: string, result: Prisma.InputJsonValue, durationMs: number) {
    return this.prisma.studioRenderJob.update({
      where: { id },
      data: { status: 'SUCCEEDED', result, durationMs, completedAt: new Date() },
    });
  }

  async failJob(id: string, errorCode: string, error: string, dead = false) {
    return this.prisma.studioRenderJob.update({
      where: { id },
      data: {
        status: dead ? 'DEAD_LETTER' : 'FAILED',
        errorCode,
        error: error.slice(0, 1000),
        completedAt: new Date(),
      },
    });
  }

  async createAnimationJob(data: Prisma.StudioAnimationJobUncheckedCreateInput) {
    return this.prisma.studioAnimationJob.create({ data });
  }

  async createAudioJob(data: Prisma.StudioAudioJobUncheckedCreateInput) {
    return this.prisma.studioAudioJob.create({ data });
  }

  async createRenderOutput(data: Prisma.StudioRenderOutputUncheckedCreateInput) {
    return this.prisma.studioRenderOutput.create({ data });
  }

  async renderOutputs(productionId: string, kind?: string) {
    return this.prisma.studioRenderOutput.findMany({
      where: { productionId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async sceneOutputs(productionId: string) {
    return this.prisma.studioRenderOutput.findMany({
      where: { productionId, kind: 'scene' },
      orderBy: { createdAt: 'asc' },
      include: { scene: { select: { index: true, sceneId: true } } },
    });
  }

  async createSubtitle(data: Prisma.StudioSubtitleUncheckedCreateInput) {
    return this.prisma.studioSubtitle.create({ data });
  }

  async subtitles(productionId: string, format?: SubtitleFormat) {
    return this.prisma.studioSubtitle.findMany({
      where: { productionId, ...(format ? { format } : {}) },
    });
  }

  async createThumbnails(data: Prisma.StudioThumbnailUncheckedCreateInput[]) {
    if (data.length === 0) {
      return [];
    }
    await this.prisma.studioThumbnail.createMany({ data });
    return this.prisma.studioThumbnail.findMany({
      where: { productionId: data[0].productionId },
      orderBy: { candidateIndex: 'asc' },
    });
  }

  async selectThumbnail(productionId: string, id: string) {
    return this.prisma.$transaction(async tx => {
      await tx.studioThumbnail.updateMany({ where: { productionId }, data: { selected: false } });
      return tx.studioThumbnail.update({ where: { id }, data: { selected: true } });
    });
  }

  async selectedThumbnail(productionId: string) {
    return this.prisma.studioThumbnail.findFirst({ where: { productionId, selected: true } });
  }

  async upsertVariant(
    productionId: string,
    platform: SocialPlatform,
    format: VariantFormat,
    data: Omit<
      Prisma.StudioPlatformVariantUncheckedCreateInput,
      'productionId' | 'platform' | 'format'
    >
  ) {
    return this.prisma.studioPlatformVariant.upsert({
      where: { productionId_platform_format: { productionId, platform, format } },
      create: { productionId, platform, format, ...data },
      update: data,
    });
  }

  async variants(productionId: string) {
    return this.prisma.studioPlatformVariant.findMany({
      where: { productionId },
      include: { renderOutput: true, subtitle: true, thumbnail: true },
    });
  }

  async createPublishingJob(data: Prisma.StudioPublishingJobUncheckedCreateInput) {
    return this.prisma.studioPublishingJob.create({ data });
  }

  async findPublishingJobByKey(idempotencyKey: string) {
    return this.prisma.studioPublishingJob.findUnique({ where: { idempotencyKey } });
  }

  async updatePublishingJob(id: string, data: Prisma.StudioPublishingJobUncheckedUpdateInput) {
    return this.prisma.studioPublishingJob.update({ where: { id }, data });
  }

  async publishingJobs(productionId: string) {
    return this.prisma.studioPublishingJob.findMany({
      where: { productionId },
      include: { variant: true },
    });
  }

  async duePublishingJobs(limit = 25) {
    return this.prisma.studioPublishingJob.findMany({
      where: {
        status: { in: ['PENDING', 'QUEUED'] },
        OR: [{ scheduledFor: null }, { scheduledFor: { lte: new Date() } }],
      },
      orderBy: { scheduledFor: 'asc' },
      take: Math.min(limit, 100),
      include: { variant: true },
    });
  }

  async recordQualityCheck(data: Prisma.StudioQualityCheckUncheckedCreateInput) {
    return this.prisma.studioQualityCheck.create({ data });
  }

  async latestQualityCheck(productionId: string, target: string) {
    return this.prisma.studioQualityCheck.findFirst({
      where: { productionId, target },
      orderBy: { createdAt: 'desc' },
    });
  }

  async qualityVerdicts(productionId: string): Promise<Record<string, QualityVerdict>> {
    const checks = await this.prisma.studioQualityCheck.findMany({
      where: { productionId },
      orderBy: { createdAt: 'desc' },
    });
    const latest: Record<string, QualityVerdict> = {};
    for (const check of checks) {
      const key = `${check.target}:${check.targetId ?? ''}`;
      if (!(key in latest)) {
        latest[key] = check.verdict;
      }
    }
    return latest;
  }

  async profileOf(productionId: string): Promise<RenderProfile> {
    const production = await this.prisma.production.findUnique({
      where: { id: productionId },
      select: { renderProfile: true },
    });
    return production?.renderProfile ?? 'PRODUCTION';
  }
}

export const productionJobRepository = new ProductionJobRepository();
