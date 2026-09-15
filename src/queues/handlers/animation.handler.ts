import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { productionService } from '@/services/production.service';
import { productionRenderService } from '@/services/productionRender.service';
import { productionStoryService } from '@/services/productionStory.service';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { getObjectStorage } from '@/storage';
import type { RenderJobSpec, SceneSpec } from '@/studio/contracts';
import { publishJob, registerHandler } from '@/queues';

interface AnimationPlanPayload {
  production_id: string;
  scene_ids?: string[];
  master_audio_key?: string;
}

export function registerAnimationHandlers(): void {
  registerHandler<AnimationPlanPayload>('animation.plan', async message => {
    const productionId = message.payload.production_id;

    try {
      const existing = await productionJobRepository.scenes(productionId);
      if (existing.length === 0) {
        await productionStoryService.planScenes(productionId);
        await productionService.transition(productionId, 'ANIMATION_READY', 'animation.planned');
      }

      await productionService.transition(productionId, 'RENDERING', 'render.started');
      const outcome = await productionRenderService.queueSceneRenders(
        productionId,
        message.payload.scene_ids
      );

      logger.info({ productionId, ...outcome }, 'studio.render.dispatched');

      if (outcome.queued === 0) {
        await publishJob(
          'qa.approve',
          { production_id: productionId, target: 'scene', stage: 'all_cached' },
          { productionId, idempotencyKey: `cached:${productionId}:${Date.now()}` }
        );
      }
    } catch (err) {
      await productionService.fail(
        productionId,
        'animation',
        err instanceof Error ? err.message : String(err)
      );
      throw err;
    }
  });

  registerHandler<RenderJobSpec>('animation.render.2d', async message => {
    const job = message.payload;
    const workDir = await mkdtemp(join(tmpdir(), 'studio-remotion-'));

    try {
      const storage = getObjectStorage();
      const assetsDir = join(workDir, 'public');
      const props = await buildRemotionProps(job, assetsDir, storage);

      const jobFile = join(workDir, 'job.json');
      await writeFile(jobFile, JSON.stringify({ ...job, props }), 'utf8');

      const outputPath = join(workDir, `${job.scene.scene_id}.mp4`);
      const result = await runRemotion(jobFile, outputPath, assetsDir);

      const body = await readFile(outputPath);
      await storage.put({ key: job.output_key, body, contentType: 'video/mp4' });

      await productionRenderService.recordSceneOutput({
        productionId: job.production_id,
        sceneId: job.scene.scene_id,
        storageKey: job.output_key,
        width: result.width,
        height: result.height,
        fps: result.fps,
        durationSeconds: result.duration_seconds,
        bytes: body.byteLength,
        checksum: result.checksum,
        hasAudio: result.has_audio,
        durationMs: result.duration_ms ?? 0,
        engine: 'REMOTION',
      });

      await publishJob(
        'qa.inspect',
        {
          target: 'scene',
          target_id: job.scene.scene_id,
          video_key: job.output_key,
          expected: {
            width: job.settings.width,
            height: job.settings.height,
            fps: job.settings.fps,
            duration_seconds: job.scene.duration_seconds,
          },
        },
        { productionId: job.production_id, idempotencyKey: `qa:${job.job_id}` }
      );
    } finally {
      await rm(workDir, { recursive: true, force: true });
    }
  });
}

async function buildRemotionProps(
  job: RenderJobSpec,
  assetsDir: string,
  storage: ReturnType<typeof getObjectStorage>
): Promise<Record<string, unknown>> {
  const scene: SceneSpec = job.scene;
  const characterSources: Record<string, string> = {};

  for (const shot of scene.shots) {
    for (const character of shot.characters) {
      const key = job.asset_manifest[character.character_id];
      if (key && !characterSources[character.character_id]) {
        characterSources[character.character_id] = await storage.signedUrl(key, 3600);
      }
    }
  }

  const backgroundLayers = await Promise.all(
    scene.background_layers.map(async layer => ({
      asset_key: await storage.signedUrl(
        job.asset_manifest[layer.asset_key] ?? layer.asset_key,
        3600
      ),
      depth: layer.depth,
    }))
  );

  const audioKey = job.audio_manifest[`${scene.scene_id}_master`];

  return {
    scene_id: scene.scene_id,
    duration_seconds: scene.duration_seconds,
    fps: job.settings.fps,
    width: job.settings.width,
    height: job.settings.height,
    background_layers: backgroundLayers,
    character_sources: characterSources,
    shots: scene.shots,
    subtitles: [],
    audio_src: audioKey ? await storage.signedUrl(audioKey, 3600) : undefined,
  };
}

interface RemotionResult {
  width: number;
  height: number;
  fps: number;
  duration_seconds: number;
  checksum: string;
  has_audio: boolean;
  duration_ms?: number;
}

function runRemotion(
  jobFile: string,
  outputPath: string,
  assetsDir: string
): Promise<RemotionResult> {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(
      'node',
      [
        join(env.STUDIO_REMOTION_DIR, 'render', 'render-scene.mjs'),
        '--job',
        jobFile,
        '--output',
        outputPath,
        '--assets',
        assetsDir,
        '--concurrency',
        String(env.STUDIO_REMOTION_CONCURRENCY),
      ],
      { cwd: env.STUDIO_REMOTION_DIR, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr.on('data', chunk => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('close', code => {
      if (code !== 0) {
        reject(new Error(`remotion exited ${code}: ${stderr.slice(-2000)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim().split('\n').pop() ?? '{}') as RemotionResult;
        resolve({ ...parsed, duration_ms: Date.now() - started });
      } catch (err) {
        reject(new Error(`remotion produced unparseable output: ${String(err)}`));
      }
    });
  });
}
