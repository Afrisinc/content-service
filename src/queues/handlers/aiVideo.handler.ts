import { logger } from '@/utils/logger';
import { productionService } from '@/services/production.service';
import { productionVideoService } from '@/services/productionVideo.service';
import type { RenderJobSpec } from '@/studio/contracts';
import { publishJob, registerHandler } from '@/queues';

export function registerAiVideoHandlers(): void {
  registerHandler<RenderJobSpec>('animation.render.ai', async message => {
    const job = message.payload;

    try {
      const outcome = await productionVideoService.renderScene(job);

      await publishJob(
        'qa.inspect',
        {
          target: 'scene',
          target_id: job.scene.scene_id,
          video_key: outcome.outputKey,
          expected: {
            width: job.settings.width,
            height: job.settings.height,
            fps: job.settings.fps,
            duration_seconds: job.scene.duration_seconds,
          },
          thresholds: { require_audio: false },
        },
        { productionId: job.production_id, idempotencyKey: `qa:${job.job_id}` }
      );

      logger.info(
        {
          productionId: job.production_id,
          sceneId: job.scene.scene_id,
          shots: outcome.shots.length,
        },
        'studio.video.scene_queued_for_qa'
      );
    } catch (err) {
      await productionService.fail(
        job.production_id,
        'render',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });
}
