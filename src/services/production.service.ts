import { ApprovalStage, Prisma, ProductionStatus } from '@prisma/client';
import { env } from '@/config/env';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import {
  productionRepository,
  type CreateProductionInput,
} from '@/repositories/production.repository';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { assertTransition, isTerminal, progressRatio } from '@/studio/pipeline/state-machine';
import { publishJob } from '@/queues';

export interface ProductionBrief extends CreateProductionInput {
  userId: string;
}

export class ProductionService {
  async create(brief: ProductionBrief) {
    if (brief.idempotencyKey) {
      const existing = await productionRepository.findByIdempotencyKey(brief.idempotencyKey);
      if (existing) {
        return existing;
      }
    }

    const production = await productionRepository.create({
      ...brief,
      language: brief.language ?? env.STUDIO_DEFAULT_LANGUAGE,
      visualStyle: brief.visualStyle ?? env.STUDIO_DEFAULT_VISUAL_STYLE,
      targetDurationSeconds: brief.targetDurationSeconds ?? env.STUDIO_DEFAULT_DURATION_SECONDS,
      autoApprove: brief.autoApprove ?? env.STUDIO_AUTO_APPROVE,
    });

    await productionRepository.recordEvent({
      productionId: production.id,
      event: 'production.created',
      toStatus: 'DRAFT',
    });

    logger.info({ productionId: production.id, userId: brief.userId }, 'studio.production.created');
    return production;
  }

  async start(productionId: string) {
    const production = await this.require(productionId);
    if (isTerminal(production.status)) {
      throw new ConflictError(`this production is already ${production.status.toLowerCase()}`);
    }

    await this.transition(productionId, 'PLANNING', 'production.started');
    await publishJob(
      'story.generate',
      { production_id: productionId },
      {
        productionId,
        idempotencyKey: `story:${productionId}`,
      }
    );

    return productionRepository.findById(productionId);
  }

  async get(productionId: string) {
    const production = await productionRepository.findWithGraph(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }
    return production;
  }

  async list(params: {
    userId?: string;
    status?: ProductionStatus;
    page?: number;
    limit?: number;
  }) {
    return productionRepository.list(params);
  }

  async status(productionId: string) {
    const production = await this.require(productionId);
    const scenes = await productionJobRepository.scenes(productionId);
    const variants = await productionJobRepository.variants(productionId);
    const publishing = await productionJobRepository.publishingJobs(productionId);
    const verdicts = await productionJobRepository.qualityVerdicts(productionId);
    const approvals = await productionRepository.approvals(productionId);

    return {
      id: production.id,
      status: production.status,
      progress: progressRatio(production.status),
      failedStage: production.failedStage,
      errorMessage: production.errorMessage,
      scenes: scenes.map(scene => ({
        sceneId: scene.sceneId,
        index: scene.index,
        status: scene.status,
        durationSeconds: scene.durationSeconds,
        shots: scene.shots.length,
      })),
      variants: variants.map(variant => ({
        id: variant.id,
        platform: variant.platform,
        format: variant.format,
        status: variant.status,
        hasMetadata: Boolean(variant.title),
      })),
      publishing: publishing.map(job => ({
        platform: job.platform,
        status: job.status,
        externalUrl: job.externalUrl,
        attempts: job.attempts,
      })),
      quality: verdicts,
      approvals: approvals.map(approval => ({
        stage: approval.stage,
        decision: approval.decision,
      })),
    };
  }

  async events(productionId: string) {
    await this.require(productionId);
    return productionRepository.events(productionId);
  }

  async approve(productionId: string, stage: ApprovalStage, decidedBy: string) {
    const production = await this.require(productionId);
    await productionRepository.upsertApproval(productionId, stage, 'APPROVED', decidedBy);

    await productionRepository.recordEvent({
      productionId,
      event: `approval.${stage.toLowerCase()}.approved`,
      fromStatus: production.status,
      payload: { decidedBy } as Prisma.InputJsonValue,
    });

    if (stage === 'STORY' && production.status === 'SCRIPT_READY') {
      await publishJob(
        'asset.generate',
        { production_id: productionId },
        {
          productionId,
          idempotencyKey: `assets:${productionId}`,
        }
      );
    }

    if (stage === 'FINAL_VIDEO' && production.status === 'QUALITY_CHECK') {
      await this.transition(productionId, 'APPROVED', 'production.approved');
    }

    if (stage === 'PUBLISHING' && production.status === 'APPROVED') {
      await this.publish(productionId);
    }

    return productionRepository.findById(productionId);
  }

  async reject(productionId: string, stage: ApprovalStage, decidedBy: string, reason: string) {
    const production = await this.require(productionId);
    await productionRepository.upsertApproval(productionId, stage, 'REJECTED', decidedBy, reason);
    await productionRepository.recordEvent({
      productionId,
      event: `approval.${stage.toLowerCase()}.rejected`,
      fromStatus: production.status,
      payload: { decidedBy, reason } as Prisma.InputJsonValue,
    });
    return productionRepository.findById(productionId);
  }

  async rerenderScene(productionId: string, sceneId: string) {
    const production = await this.require(productionId);
    const scene = await productionJobRepository.sceneBySceneId(productionId, sceneId);
    if (!scene) {
      throw new NotFoundError(`scene ${sceneId} not found in this production`);
    }

    await productionJobRepository.setSceneStatus(scene.id, 'PENDING');
    await productionRepository.updateStatus(productionId, 'RENDERING');
    await productionRepository.recordEvent({
      productionId,
      event: 'scene.rerender_requested',
      fromStatus: production.status,
      toStatus: 'RENDERING',
      payload: { sceneId } as Prisma.InputJsonValue,
    });

    await publishJob(
      'animation.plan',
      { production_id: productionId, scene_ids: [sceneId] },
      {
        productionId,
        idempotencyKey: `rerender:${productionId}:${sceneId}:${Date.now()}`,
      }
    );

    return { productionId, sceneId, status: 'queued' };
  }

  async publish(productionId: string, scheduledFor?: Date) {
    const production = await this.require(productionId);
    if (production.status !== 'APPROVED' && production.status !== 'PUBLISHING') {
      throw new ConflictError('a production must be approved before it can be published');
    }

    await this.transition(productionId, 'PUBLISHING', 'production.publishing');
    await publishJob(
      'qa.approve',
      { production_id: productionId, scheduled_for: scheduledFor?.toISOString(), stage: 'publish' },
      { productionId, idempotencyKey: `publish-gate:${productionId}` }
    );

    return productionRepository.findById(productionId);
  }

  async cancel(productionId: string, reason: string) {
    const production = await this.require(productionId);
    if (isTerminal(production.status)) {
      throw new ConflictError(`this production is already ${production.status.toLowerCase()}`);
    }
    await this.transition(productionId, 'CANCELLED', 'production.cancelled', {
      errorMessage: reason,
    });
    return productionRepository.findById(productionId);
  }

  async retry(productionId: string) {
    const production = await this.require(productionId);
    if (production.status !== 'FAILED') {
      throw new ConflictError('only a failed production can be retried');
    }

    const stage = production.failedStage ?? 'story';
    await this.transition(productionId, 'RETRYING', 'production.retrying');

    const queue = RETRY_QUEUE[stage] ?? 'story.generate';
    await publishJob(
      queue,
      { production_id: productionId },
      {
        productionId,
        idempotencyKey: `${stage}:${productionId}:${Date.now()}`,
      }
    );

    return productionRepository.findById(productionId);
  }

  async transition(
    productionId: string,
    to: ProductionStatus,
    event: string,
    extra: Prisma.ProductionUpdateInput = {}
  ) {
    const production = await this.require(productionId);
    assertTransition(production.status, to);

    const updated = await productionRepository.updateStatus(productionId, to, extra);
    await productionRepository.recordEvent({
      productionId,
      event,
      fromStatus: production.status,
      toStatus: to,
    });

    return updated;
  }

  async fail(productionId: string, stage: string, message: string) {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      return;
    }
    await productionRepository.markFailed(productionId, stage, message);
    await productionRepository.recordEvent({
      productionId,
      event: 'production.failed',
      fromStatus: production.status,
      toStatus: 'FAILED',
      errorCode: stage,
      payload: { message } as Prisma.InputJsonValue,
    });
  }

  private async require(productionId: string) {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }
    return production;
  }
}

const RETRY_QUEUE: Record<
  string,
  | 'story.generate'
  | 'asset.generate'
  | 'audio.generate'
  | 'animation.plan'
  | 'video.compose'
  | 'qa.inspect'
> = {
  story: 'story.generate',
  assets: 'asset.generate',
  audio: 'audio.generate',
  animation: 'animation.plan',
  render: 'animation.plan',
  compose: 'video.compose',
  quality: 'qa.inspect',
};

export function assertBrief(brief: Partial<ProductionBrief>): void {
  if (!brief.idea || brief.idea.trim().length < 10) {
    throw new BadRequestError(
      'the idea needs at least ten characters for the story director to work with'
    );
  }
}

export const productionService = new ProductionService();
