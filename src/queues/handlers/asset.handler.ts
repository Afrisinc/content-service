import { productionService } from '@/services/production.service';
import { productionAssetService } from '@/services/productionAsset.service';
import { productionRepository } from '@/repositories/production.repository';
import { publishJob, registerHandler } from '@/queues';

interface AssetPayload {
  production_id: string;
}

export function registerAssetHandlers(): void {
  registerHandler<AssetPayload>('asset.generate', async message => {
    const productionId = message.payload.production_id;

    try {
      await productionService.transition(productionId, 'ASSETS_GENERATING', 'assets.started');
      await productionAssetService.generateForProduction(productionId);
      await productionService.transition(productionId, 'ASSETS_READY', 'assets.ready');

      const production = await productionRepository.findById(productionId);
      if (production?.autoApprove) {
        await publishJob(
          'audio.generate',
          { production_id: productionId },
          {
            productionId,
            idempotencyKey: `audio:${productionId}`,
          }
        );
      } else {
        await productionRepository.upsertApproval(productionId, 'ASSETS', 'PENDING');
      }
    } catch (err) {
      await productionService.fail(
        productionId,
        'assets',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });

  registerHandler<AssetPayload>('asset.validate', async message => {
    await productionAssetService.generateForProduction(message.payload.production_id);
  });
}
