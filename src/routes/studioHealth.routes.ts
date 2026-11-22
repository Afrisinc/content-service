import { FastifyInstance } from 'fastify';
import { env } from '@/config/env';
import { metricsSnapshot, registry } from '@/observability/metrics';
import { queuesHealthy } from '@/queues';
import { getObjectStorage } from '@/storage';
import { videoPreviewRequestSchema } from '@/studio/contracts';
import { framesForDuration } from '@/studio/engines/render-profiles';
import { getMediaEngineClient } from '@/studio/engines/media.client';
import { getVideoProvider, providerHealth } from '@/studio/providers';
import { NotFoundError } from '@/utils/http-error';

const TAGS = ['studio'];
const PREVIEW_DEFAULT_SECONDS = 3;

export async function studioHealthRoutes(app: FastifyInstance) {
  app.get('/studio/ready', { schema: { tags: TAGS } }, async (_request, reply) => {
    const [queues, storage, media, providers] = await Promise.all([
      queuesHealthy(),
      getObjectStorage().healthy(),
      getMediaEngineClient().healthy(),
      providerHealth(),
    ]);

    const checks = { queues, storage, media, ...providers };
    const healthy = queues && storage && media;

    reply.code(healthy ? 200 : 503).send({
      status: healthy ? 'healthy' : 'degraded',
      checks,
    });
  });

  app.get('/studio/metrics', { schema: { tags: TAGS } }, async (_request, reply) => {
    reply.header('Content-Type', registry.contentType);
    return metricsSnapshot();
  });

  app.get('/studio/video/health', { schema: { tags: TAGS } }, async (_request, reply) => {
    const provider = getVideoProvider();
    const up = await provider.healthy();

    reply.code(up ? 200 : 503).send({
      status: up ? 'healthy' : 'unreachable',
      provider: provider.name,
      model: provider.model,
      endpoint: env.COMFYUI_BASE_URL,
      max_frames: provider.maxFrames,
      preview_enabled: env.STUDIO_VIDEO_PREVIEW_ENABLED,
    });
  });

  app.post('/studio/video/preview', { schema: { tags: TAGS } }, async (request, reply) => {
    if (!env.STUDIO_VIDEO_PREVIEW_ENABLED) {
      throw new NotFoundError('studio video preview is disabled');
    }

    const body = videoPreviewRequestSchema.parse(request.body ?? {});
    const provider = getVideoProvider();
    const fps = body.fps ?? env.STUDIO_VIDEO_FPS;
    const maxFrames = Math.min(env.STUDIO_VIDEO_MAX_FRAMES, provider.maxFrames);
    const frames = framesForDuration(body.seconds ?? PREVIEW_DEFAULT_SECONDS, fps, maxFrames);
    const startedAt = Date.now();

    const result = await provider.generate({
      prompt: body.prompt,
      negativePrompt: body.negative_prompt,
      width: body.width ?? env.STUDIO_VIDEO_WIDTH,
      height: body.height ?? env.STUDIO_VIDEO_HEIGHT,
      frames,
      fps,
      steps: body.steps ?? env.STUDIO_VIDEO_STEPS,
      cfgScale: body.cfg_scale ?? env.STUDIO_VIDEO_CFG,
      seed: body.seed,
      workflow: body.workflow,
    });

    return reply
      .header('Content-Type', result.mimeType)
      .header('Content-Disposition', 'inline; filename="preview.mp4"')
      .header('X-Studio-Model', provider.model)
      .header('X-Studio-Seed', String(result.seed))
      .header('X-Studio-Frames', String(result.frames))
      .header('X-Studio-Fps', String(result.fps))
      .header('X-Studio-Duration-Seconds', String(result.durationSeconds))
      .header('X-Studio-Elapsed-Ms', String(Date.now() - startedAt))
      .send(result.video);
  });
}
