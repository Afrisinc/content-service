import type { SocialPlatform } from '@prisma/client';
import { logger } from '@/utils/logger';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { productionService } from '@/services/production.service';
import { productionPublishingService } from '@/services/productionPublishing.service';
import { registerHandler, type StudioQueue } from '@/queues';

interface PublishPayload {
  publishing_job_id: string;
  production_id: string;
  variant_id: string;
  platform: SocialPlatform;
  format: string;
  video_key: string;
  thumbnail_key?: string;
  subtitle_key?: string;
  idempotency_key: string;
  scheduled_for?: string;
}

const QUEUES: Array<[StudioQueue, SocialPlatform]> = [
  ['publish.youtube', 'youtube'],
  ['publish.instagram', 'instagram'],
  ['publish.facebook', 'facebook'],
  ['publish.tiktok', 'tiktok'],
];

export function registerPublishHandlers(): void {
  for (const [queue] of QUEUES) {
    registerHandler<PublishPayload>(queue, async message => {
      const payload = message.payload;

      await productionPublishingService.publishVariant({
        publishingJobId: payload.publishing_job_id,
        productionId: payload.production_id,
        variantId: payload.variant_id,
        platform: payload.platform,
        format: payload.format,
        videoKey: payload.video_key,
        thumbnailKey: payload.thumbnail_key,
        subtitleKey: payload.subtitle_key,
        idempotencyKey: payload.idempotency_key,
        scheduledFor: payload.scheduled_for,
      });

      const jobs = await productionJobRepository.publishingJobs(payload.production_id);
      const outstanding = jobs.filter(
        job => job.status !== 'SUCCEEDED' && job.status !== 'DEAD_LETTER'
      );

      if (outstanding.length === 0) {
        await productionService.transition(
          payload.production_id,
          'PUBLISHED',
          'production.published'
        );
        logger.info({ productionId: payload.production_id }, 'studio.production.published');
      }
    });
  }
}
