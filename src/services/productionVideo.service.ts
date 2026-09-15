import { env } from '@/config/env';
import { NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { productionAssetRepository } from '@/repositories/productionAsset.repository';
import { productionRepository } from '@/repositories/production.repository';
import { checksumOf, continuityFrameKey, getObjectStorage, shotClipKey } from '@/storage';
import type {
  CharacterBible,
  EnvironmentBible,
  RenderJobSpec,
  VideoPrompt,
} from '@/studio/contracts';
import { directShotPrompts, videoPromptVersion } from '@/studio/directors';
import { getMediaEngineClient } from '@/studio/engines/media.client';
import { clipSecondsFor, framesForDuration } from '@/studio/engines/render-profiles';
import { shotClipCacheKey } from '@/studio/pipeline/cache';
import { getVideoProvider } from '@/studio/providers';
import { productionRenderService } from './productionRender.service';

export interface ShotClip {
  shotId: string;
  storageKey: string;
  cached: boolean;
  frames: number;
  seed: number;
  durationMs: number;
}

export class ProductionVideoService {
  async renderScene(
    job: RenderJobSpec
  ): Promise<{ shots: ShotClip[]; outputKey: string; durationMs: number }> {
    const startedAt = Date.now();
    const production = await productionRepository.findById(job.production_id);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const provider = getVideoProvider();
    const media = getMediaEngineClient();

    const characters = (await productionAssetRepository.charactersFor(job.production_id))
      .map(character => character.versions[0]?.spec as unknown as CharacterBible)
      .filter(Boolean);

    const environment =
      (await productionAssetRepository.environmentsFor(job.production_id))
        .map(entry => entry.versions[0]?.spec as unknown as EnvironmentBible)
        .find(bible => bible?.environment_id === job.scene.environment_id) ?? null;

    const fps = env.STUDIO_VIDEO_FPS;
    const prompts = await directShotPrompts({
      scene: job.scene,
      characters,
      environment,
      visualStyle: production.visualStyle,
      clipSeconds: clipSecondsFor(provider.maxFrames, fps),
    });

    const promptByShot = new Map(prompts.data.shots.map(shot => [shot.shot_id, shot] as const));
    const clips: ShotClip[] = [];
    let continuityKey: string | undefined;

    for (const shot of job.scene.shots) {
      const prompt = promptByShot.get(shot.shot_id);
      if (!prompt) {
        throw new NotFoundError(`no prompt was written for ${shot.shot_id}`);
      }

      const clip = await this.renderShot({
        job,
        shotId: shot.shot_id,
        durationSeconds: shot.duration_seconds,
        prompt,
        fps,
        referenceKey: this.referenceKeyFor(
          job,
          shot.characters.map(entry => entry.character_id)
        ),
        continuityKey,
      });

      clips.push(clip);

      const isLast = shot.shot_id === job.scene.shots[job.scene.shots.length - 1].shot_id;
      if (env.STUDIO_VIDEO_CONTINUITY && !isLast) {
        const frameKey = continuityFrameKey(job.production_id, job.scene.scene_id, shot.shot_id);
        await media.lastFrame({ video_key: clip.storageKey, output_key: frameKey });
        continuityKey = frameKey;
      }
    }

    const assembled = await media.assemble({
      production_id: job.production_id,
      scene_id: job.scene.scene_id,
      shot_keys: clips.map(clip => clip.storageKey),
      fps: job.settings.fps,
      width: job.settings.width,
      height: job.settings.height,
      output_key: job.output_key,
    });

    const durationMs = Date.now() - startedAt;

    await productionRenderService.recordSceneOutput({
      productionId: job.production_id,
      sceneId: job.scene.scene_id,
      storageKey: assembled.output_key,
      width: assembled.width,
      height: assembled.height,
      fps: assembled.fps,
      durationSeconds: assembled.duration_seconds,
      bytes: assembled.bytes,
      checksum: assembled.checksum,
      hasAudio: false,
      durationMs,
      engine: 'WAN',
    });

    await productionRepository.mergeReproducibility(job.production_id, {
      video_prompt: videoPromptVersion(),
      video_model: provider.model,
      video_provider: provider.name,
      video_fps: fps,
    });

    logger.info(
      {
        productionId: job.production_id,
        sceneId: job.scene.scene_id,
        shots: clips.length,
        cached: clips.filter(clip => clip.cached).length,
        durationMs,
      },
      'studio.video.scene_rendered'
    );

    return { shots: clips, outputKey: assembled.output_key, durationMs };
  }

  private referenceKeyFor(job: RenderJobSpec, characterIds: string[]): string | undefined {
    for (const characterId of characterIds) {
      const key = job.asset_manifest[characterId];
      if (key) {
        return key;
      }
    }
    return undefined;
  }

  private async renderShot(input: {
    job: RenderJobSpec;
    shotId: string;
    durationSeconds: number;
    prompt: VideoPrompt;
    fps: number;
    referenceKey?: string;
    continuityKey?: string;
  }): Promise<ShotClip> {
    const provider = getVideoProvider();
    const storage = getObjectStorage();

    const frames = framesForDuration(input.durationSeconds, input.fps, provider.maxFrames);
    const anchorKey = input.continuityKey ?? input.referenceKey;
    const workflow = anchorKey ? env.STUDIO_WAN_I2V_WORKFLOW : env.STUDIO_WAN_T2V_WORKFLOW;

    const anchor = anchorKey ? await storage.get(anchorKey) : undefined;

    const fingerprint = shotClipCacheKey({
      prompt: input.prompt.prompt,
      negativePrompt: input.prompt.negative_prompt,
      model: provider.model,
      workflow,
      width: input.job.settings.width,
      height: input.job.settings.height,
      frames,
      fps: input.fps,
      referenceChecksum: anchor ? checksumOf(anchor) : undefined,
    });

    const storageKey = shotClipKey(
      input.job.production_id,
      input.job.scene.scene_id,
      input.shotId,
      fingerprint
    );

    if (await storage.exists(storageKey)) {
      logger.info({ shotId: input.shotId, storageKey }, 'studio.video.shot_cache_hit');
      return { shotId: input.shotId, storageKey, cached: true, frames, seed: 0, durationMs: 0 };
    }

    const result = await provider.generate({
      prompt: input.prompt.prompt,
      negativePrompt: input.prompt.negative_prompt,
      width: input.job.settings.width,
      height: input.job.settings.height,
      frames,
      fps: input.fps,
      workflow,
      referenceImage: input.continuityKey ? undefined : anchor,
      continuityFrame: input.continuityKey ? anchor : undefined,
    });

    await storage.put({
      key: storageKey,
      body: result.video,
      contentType: result.mimeType,
      metadata: { shot: input.shotId, seed: String(result.seed), workflow },
    });

    return {
      shotId: input.shotId,
      storageKey,
      cached: false,
      frames: result.frames,
      seed: result.seed,
      durationMs: result.usage.durationMs,
    };
  }
}

export const productionVideoService = new ProductionVideoService();
