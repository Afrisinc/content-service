import { logger } from '@/utils/logger';
import { productionRepository } from '@/repositories/production.repository';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { productionAssetRepository } from '@/repositories/productionAsset.repository';
import { productionService } from '@/services/production.service';
import { productionQualityService } from '@/services/productionQuality.service';
import { productionRenderService } from '@/services/productionRender.service';
import { productionPublishingService } from '@/services/productionPublishing.service';
import type { QualityReport } from '@/studio/contracts';
import { publishJob, registerHandler } from '@/queues';

interface ComposeResultPayload {
  production_id: string;
  master_key: string;
  master_duration_seconds?: number;
  has_audio: boolean;
  outputs: Array<{
    format: string;
    output_key: string;
    width: number;
    height: number;
    fps: number;
    duration_seconds: number;
    bytes: number;
    checksum: string;
  }>;
}

interface GatePayload {
  production_id?: string;
  target?: string;
  stage?: string;
  scheduled_for?: string;
}

export function registerQualityHandlers(): void {
  registerHandler<ComposeResultPayload>('video.encode', async message => {
    const payload = message.payload;
    const productionId = payload.production_id;

    try {
      await productionRenderService.recordComposeResult(productionId, payload, payload.has_audio);
      await productionRenderService.buildThumbnails(productionId);
      await productionPublishingService.writeMetadata(productionId);
      await productionService.transition(productionId, 'QUALITY_CHECK', 'quality.started');

      await productionQualityService.inspectVariants(productionId);
      await runGate(productionId);
    } catch (err) {
      await productionService.fail(
        productionId,
        'compose',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });

  registerHandler<QualityReport & GatePayload>('qa.approve', async message => {
    const productionId = message.productionId || message.payload.production_id;
    if (!productionId) {
      return;
    }

    const report = message.payload as QualityReport;
    if (report.target && report.checks) {
      await productionQualityService.record(productionId, report);
    }

    if (report.target === 'scene' || message.payload.target === 'scene') {
      await maybeCompose(productionId);
      return;
    }

    if (message.payload.stage === 'publish') {
      const scheduledFor = message.payload.scheduled_for
        ? new Date(message.payload.scheduled_for)
        : undefined;
      const queued = await productionPublishingService.queuePublishing(productionId, scheduledFor);
      logger.info({ productionId, queued }, 'studio.publishing.dispatched');
      return;
    }

    if (report.target === 'master') {
      await runGate(productionId);
    }
  });

  registerHandler<QualityReport>('qa.reject', async message => {
    const productionId = message.productionId;
    const report = message.payload;

    await productionQualityService.record(productionId, report);
    logger.warn(
      { productionId, target: report.target, failures: report.failures },
      'studio.quality.failed'
    );

    if (report.target === 'scene' && report.target_id) {
      const scene = await productionJobRepository.sceneBySceneId(productionId, report.target_id);
      if (scene) {
        await productionJobRepository.setSceneStatus(scene.id, 'FAILED');
      }
      await productionService.fail(
        productionId,
        'render',
        `scene ${report.target_id} failed quality: ${report.failures.join(', ')}`
      );
      return;
    }

    await productionService.fail(
      productionId,
      'quality',
      `${report.target} failed quality: ${report.failures.join(', ')}`
    );
  });

  registerHandler<{ production_id: string }>('qa.inspect', async message => {
    const report = await productionQualityService.inspectMaster(message.payload.production_id);
    logger.info(
      { productionId: message.payload.production_id, verdict: report.verdict },
      'studio.quality.inspected'
    );
  });
}

async function maybeCompose(productionId: string): Promise<void> {
  const complete = await productionRenderService.allScenesRendered(productionId);
  if (!complete) {
    return;
  }

  const production = await productionRepository.findById(productionId);
  if (!production || production.status === 'POST_PROCESSING') {
    return;
  }

  const master = (await productionAssetRepository.audioTracks(productionId, 'MASTER'))[0];
  const subtitle = (await productionJobRepository.subtitles(productionId, 'ASS'))[0];

  const spec = await productionRenderService.buildComposeSpec(
    productionId,
    master?.storageKey,
    subtitle?.storageKey
  );

  await productionService.transition(productionId, 'POST_PROCESSING', 'compose.started');
  await publishJob('video.compose', spec, {
    productionId,
    idempotencyKey: `compose:${productionId}`,
  });
}

async function runGate(productionId: string): Promise<void> {
  const gate = await productionQualityService.gate(productionId);

  if (!gate.approved && gate.failures.length > 0) {
    await productionService.fail(
      productionId,
      'quality',
      `quality gate rejected: ${gate.failures.join(', ')}`
    );
    return;
  }

  if (gate.approved) {
    await productionService.transition(productionId, 'APPROVED', 'production.approved');
    const production = await productionRepository.findById(productionId);
    if (production?.autoApprove) {
      await productionService.publish(productionId);
    }
  }
}
