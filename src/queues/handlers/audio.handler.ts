import { productionService } from '@/services/production.service';
import { productionAudioService } from '@/services/productionAudio.service';
import { productionRepository } from '@/repositories/production.repository';
import { publishJob, registerHandler } from '@/queues';

interface AudioPayload {
  production_id: string;
}

export function registerAudioHandlers(): void {
  registerHandler<AudioPayload>('audio.generate', async message => {
    const productionId = message.payload.production_id;

    try {
      await productionService.transition(productionId, 'AUDIO_GENERATING', 'audio.started');

      const tracks = await productionAudioService.renderNarration(productionId);
      const segments = tracks.flatMap(track => track.segments);

      const production = await productionRepository.findById(productionId);
      await productionAudioService.buildSubtitles(
        productionId,
        segments,
        production?.language ?? 'en'
      );
      const masterKey = await productionAudioService.mixMaster(productionId, tracks);

      await productionService.transition(productionId, 'AUDIO_READY', 'audio.ready');
      await publishJob(
        'animation.plan',
        { production_id: productionId, master_audio_key: masterKey },
        {
          productionId,
          idempotencyKey: `animation:${productionId}`,
        }
      );
    } catch (err) {
      await productionService.fail(
        productionId,
        'audio',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });
}
