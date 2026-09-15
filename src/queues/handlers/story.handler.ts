import { logger } from '@/utils/logger';
import { productionRepository } from '@/repositories/production.repository';
import { productionService } from '@/services/production.service';
import { productionStoryService } from '@/services/productionStory.service';
import { publishJob, registerHandler, type StudioMessage } from '@/queues';

interface StoryPayload {
  production_id: string;
}

export function registerStoryHandlers(): void {
  registerHandler<StoryPayload>('story.generate', async message => {
    const productionId = message.payload.production_id;

    try {
      await productionStoryService.planStory(productionId);
      await productionStoryService.buildBibles(productionId);
      await productionService.transition(productionId, 'SCRIPT_READY', 'story.ready');

      const production = await productionRepository.findById(productionId);
      if (production?.autoApprove) {
        await publishJob(
          'asset.generate',
          { production_id: productionId },
          {
            productionId,
            idempotencyKey: `assets:${productionId}`,
          }
        );
      } else {
        await productionRepository.upsertApproval(productionId, 'STORY', 'PENDING');
        logger.info({ productionId }, 'studio.story.awaiting_approval');
      }
    } catch (err) {
      await productionService.fail(
        productionId,
        'story',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });

  registerHandler<StoryPayload>('story.validate', async message => {
    const story = await productionRepository.getStory(message.payload.production_id);
    if (!story) {
      throw new Error('validation: this production has no story to validate');
    }
    logger.info({ productionId: message.payload.production_id }, 'studio.story.validated');
  });
}

export type { StoryPayload, StudioMessage };
