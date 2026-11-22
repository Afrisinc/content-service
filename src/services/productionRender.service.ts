import { Prisma, VariantFormat } from '@prisma/client';
import { env } from '@/config/env';
import { NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { recordRender } from '@/observability/metrics';
import { productionAssetRepository } from '@/repositories/productionAsset.repository';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { productionRepository } from '@/repositories/production.repository';
import { areaKey, masterKey, sceneRenderKey, variantKey } from '@/storage';
import type {
  CharacterBible,
  EnvironmentBible,
  RenderJobSpec,
  SceneSpec,
} from '@/studio/contracts';
import { getMediaEngineClient } from '@/studio/engines/media.client';
import {
  engineFor,
  formatsForPlatforms,
  masterSettings,
  queueForMode,
  variantSpecs,
} from '@/studio/engines/render-profiles';
import { sceneCacheKey } from '@/studio/pipeline/cache';
import { publishJob } from '@/queues';

export class ProductionRenderService {
  async buildAssetManifest(productionId: string): Promise<Record<string, string>> {
    const manifest: Record<string, string> = {};

    for (const character of await productionAssetRepository.charactersFor(productionId)) {
      const version = character.versions[0];
      if (!version) {
        continue;
      }
      const bible = version.spec as unknown as CharacterBible;
      const key = version.assetKeys[0];
      if (key) {
        manifest[bible.character_id] = key;
      }
    }

    for (const environment of await productionAssetRepository.environmentsFor(productionId)) {
      const version = environment.versions[0];
      if (!version) {
        continue;
      }
      const bible = version.spec as unknown as EnvironmentBible;
      version.assetKeys.forEach((key, index) => {
        manifest[
          index === 0 ? bible.environment_id : `${bible.environment_id}_layer_${index - 1}`
        ] = key;
      });
    }

    return manifest;
  }

  async buildAudioManifest(productionId: string): Promise<Record<string, string>> {
    const manifest: Record<string, string> = {};
    for (const track of await productionAssetRepository.audioTracks(productionId)) {
      const identifier =
        track.storageKey
          .split('/')
          .pop()
          ?.replace(/\.wav$/, '') ?? track.id;
      manifest[identifier] = track.storageKey;
      manifest[`${identifier}.visemes`] = `${track.storageKey}.visemes.json`;
    }
    return manifest;
  }

  async queueSceneRenders(
    productionId: string,
    only?: string[]
  ): Promise<{ queued: number; cached: number }> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const scenes = await productionJobRepository.scenes(productionId);
    const settings = masterSettings(production.animationMode, production.renderProfile);
    const engine = engineFor(production.animationMode, production.renderProfile);

    const assetManifest = await this.buildAssetManifest(productionId);
    const audioManifest = await this.buildAudioManifest(productionId);

    let queued = 0;
    let cached = 0;

    for (const scene of scenes) {
      if (only && only.length > 0 && !only.includes(scene.sceneId)) {
        continue;
      }

      const spec = scene.spec as unknown as SceneSpec;
      const cacheKey = sceneCacheKey({
        scene: spec,
        assetVersions: Object.fromEntries(Object.keys(assetManifest).map(key => [key, 1])),
        audioChecksums: Object.fromEntries(Object.entries(audioManifest)),
        engineVersion: engine,
        profile: production.renderProfile,
        settings,
      });

      const reusable = await productionJobRepository.findRenderJobByCacheKey(cacheKey);
      if (reusable && reusable.outputs.length > 0) {
        await productionJobRepository.setSceneStatus(scene.id, 'SUCCEEDED', cacheKey);
        cached += 1;
        logger.info({ productionId, sceneId: scene.sceneId }, 'studio.render.reused');
        continue;
      }

      const outputKey = sceneRenderKey(
        productionId,
        scene.sceneId,
        production.renderProfile.toLowerCase()
      );
      const idempotencyKey = `render:${productionId}:${scene.sceneId}:${cacheKey.slice(0, 16)}`;

      const existing = await productionJobRepository.findRenderJobByIdempotencyKey(idempotencyKey);
      if (existing && existing.status !== 'FAILED' && existing.status !== 'DEAD_LETTER') {
        continue;
      }

      const jobSpec: RenderJobSpec = {
        job_id: idempotencyKey,
        production_id: productionId,
        scene: spec,
        profile: production.renderProfile.toLowerCase() as RenderJobSpec['profile'],
        settings,
        asset_manifest: assetManifest,
        audio_manifest: audioManifest,
        output_key: outputKey,
        timeout_seconds: env.STUDIO_SCENE_RENDER_TIMEOUT_SECONDS,
      };

      const job = await productionJobRepository.createRenderJob({
        productionId,
        sceneId: scene.id,
        engine,
        profile: production.renderProfile,
        idempotencyKey,
        cacheKey,
        payload: jobSpec as unknown as Prisma.InputJsonValue,
        status: 'QUEUED',
      });

      await productionJobRepository.setSceneStatus(scene.id, 'QUEUED', cacheKey);
      await publishJob(queueForMode(production.animationMode), jobSpec, {
        productionId,
        idempotencyKey,
      });

      logger.info(
        { productionId, sceneId: scene.sceneId, jobId: job.id, engine },
        'studio.render.queued'
      );
      queued += 1;
    }

    return { queued, cached };
  }

  async recordSceneOutput(input: {
    productionId: string;
    sceneId: string;
    jobId?: string;
    storageKey: string;
    width: number;
    height: number;
    fps: number;
    durationSeconds: number;
    bytes: number;
    checksum: string;
    hasAudio: boolean;
    durationMs: number;
    engine: string;
  }) {
    const scene = await productionJobRepository.sceneBySceneId(input.productionId, input.sceneId);
    const profile = await productionJobRepository.profileOf(input.productionId);

    recordRender(input.engine, profile, input.durationMs);

    const output = await productionJobRepository.createRenderOutput({
      productionId: input.productionId,
      sceneId: scene?.id ?? null,
      jobId: input.jobId ?? null,
      kind: 'scene',
      storageKey: input.storageKey,
      width: input.width,
      height: input.height,
      fps: input.fps,
      durationSeconds: input.durationSeconds,
      bytes: input.bytes,
      checksum: input.checksum,
      hasAudio: input.hasAudio,
      profile,
    });

    if (scene) {
      await productionJobRepository.setSceneStatus(scene.id, 'SUCCEEDED');
    }

    return output;
  }

  async allScenesRendered(productionId: string): Promise<boolean> {
    const scenes = await productionJobRepository.scenes(productionId);
    if (scenes.length === 0) {
      return false;
    }
    return scenes.every(scene => scene.status === 'SUCCEEDED');
  }

  async buildComposeSpec(productionId: string, masterAudioKey?: string, subtitleKey?: string) {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const outputs = await productionJobRepository.sceneOutputs(productionId);
    if (outputs.length === 0) {
      throw new NotFoundError('this production has no rendered scenes');
    }

    const ordered = [...outputs].sort((a, b) => (a.scene?.index ?? 0) - (b.scene?.index ?? 0));
    const formats = formatsForPlatforms(production.platforms, production.formats);

    return {
      production_id: productionId,
      scene_keys: ordered.map(output => output.storageKey),
      master_audio_key: masterAudioKey,
      subtitle_key: subtitleKey,
      watermark_key: env.STUDIO_WATERMARK_KEY || undefined,
      variants: variantSpecs(formats),
      output_prefix: areaKey(productionId, 'platform'),
      target_lufs: env.STUDIO_TARGET_LUFS,
    };
  }

  async recordComposeResult(
    productionId: string,
    result: {
      master_key: string;
      master_duration_seconds?: number;
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
    },
    hasAudio: boolean
  ) {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const master = await productionJobRepository.createRenderOutput({
      productionId,
      kind: 'master',
      storageKey: result.master_key,
      width: 1920,
      height: 1080,
      fps: env.STUDIO_MASTER_FPS,
      durationSeconds: result.master_duration_seconds ?? result.outputs[0]?.duration_seconds ?? 0,
      hasAudio,
      profile: production.renderProfile,
    });

    const labelToFormat: Record<string, VariantFormat> = {
      '16:9': 'LANDSCAPE_16_9',
      '9:16': 'VERTICAL_9_16',
      '4:5': 'PORTRAIT_4_5',
      '1:1': 'SQUARE_1_1',
    };

    for (const variant of result.outputs) {
      const format = labelToFormat[variant.format];
      if (!format) {
        continue;
      }

      const output = await productionJobRepository.createRenderOutput({
        productionId,
        kind: 'variant',
        storageKey: variant.output_key,
        width: variant.width,
        height: variant.height,
        fps: variant.fps,
        durationSeconds: variant.duration_seconds,
        bytes: variant.bytes,
        checksum: variant.checksum,
        hasAudio,
        profile: production.renderProfile,
      });

      for (const platform of production.platforms) {
        await productionJobRepository.upsertVariant(productionId, platform, format, {
          renderOutputId: output.id,
          storageKey: variant.output_key,
          status: 'PENDING',
        });
      }
    }

    logger.info({ productionId, variants: result.outputs.length }, 'studio.compose.recorded');
    return master;
  }

  async composeMaster(productionId: string, masterAudioKey?: string, subtitleKey?: string) {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const outputs = await productionJobRepository.sceneOutputs(productionId);
    if (outputs.length === 0) {
      throw new NotFoundError('this production has no rendered scenes');
    }

    const ordered = [...outputs].sort((a, b) => (a.scene?.index ?? 0) - (b.scene?.index ?? 0));
    const formats = formatsForPlatforms(production.platforms, production.formats);

    const response = await getMediaEngineClient().compose({
      production_id: productionId,
      scene_keys: ordered.map(output => output.storageKey),
      master_audio_key: masterAudioKey,
      subtitle_key: subtitleKey,
      watermark_key: env.STUDIO_WATERMARK_KEY || undefined,
      variants: variantSpecs(formats),
      output_prefix: areaKey(productionId, 'platform'),
      target_lufs: env.STUDIO_TARGET_LUFS,
    });

    await productionJobRepository.createRenderOutput({
      productionId,
      kind: 'master',
      storageKey: response.master_key,
      width: 1920,
      height: 1080,
      fps: env.STUDIO_MASTER_FPS,
      durationSeconds: response.master_duration_seconds,
      hasAudio: Boolean(masterAudioKey),
      profile: production.renderProfile,
    });

    const labelToFormat: Record<string, VariantFormat> = {
      '16:9': 'LANDSCAPE_16_9',
      '9:16': 'VERTICAL_9_16',
      '4:5': 'PORTRAIT_4_5',
      '1:1': 'SQUARE_1_1',
    };

    for (const variant of response.outputs) {
      const format = labelToFormat[variant.format];
      if (!format) {
        continue;
      }

      const output = await productionJobRepository.createRenderOutput({
        productionId,
        kind: 'variant',
        storageKey: variant.output_key,
        width: variant.width,
        height: variant.height,
        fps: variant.fps,
        durationSeconds: variant.duration_seconds,
        bytes: variant.bytes,
        checksum: variant.checksum,
        hasAudio: Boolean(masterAudioKey),
        profile: production.renderProfile,
      });

      for (const platform of production.platforms) {
        await productionJobRepository.upsertVariant(productionId, platform, format, {
          renderOutputId: output.id,
          storageKey: variant.output_key,
          status: 'PENDING',
        });
      }
    }

    logger.info({ productionId, variants: response.outputs.length }, 'studio.compose.completed');
    return response;
  }

  async buildThumbnails(productionId: string) {
    const outputs = await productionJobRepository.renderOutputs(productionId, 'master');
    const master = outputs[0];
    if (!master) {
      throw new NotFoundError('this production has no master render');
    }

    const response = await getMediaEngineClient().thumbnails({
      production_id: productionId,
      video_key: master.storageKey,
      candidate_count: env.STUDIO_THUMBNAIL_CANDIDATES,
      output_prefix: areaKey(productionId, 'thumbnails'),
    });

    const created = await productionJobRepository.createThumbnails(
      response.candidates.map(candidate => ({
        productionId,
        storageKey: candidate.output_key,
        width: 1280,
        height: 720,
        candidateIndex: candidate.index,
        score: candidate.score,
        scoreReport: candidate as unknown as Prisma.InputJsonValue,
        selected: false,
      }))
    );

    const winner =
      created.find(thumbnail => thumbnail.candidateIndex === response.selected_index) ?? created[0];
    if (winner) {
      await productionJobRepository.selectThumbnail(productionId, winner.id);
    }

    return created;
  }

  masterStorageKey(productionId: string): string {
    return masterKey(productionId);
  }

  variantStorageKey(productionId: string, platform: string, format: string): string {
    return variantKey(productionId, platform, format);
  }
}

export const productionRenderService = new ProductionRenderService();
