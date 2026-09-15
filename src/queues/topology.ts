export const STUDIO_EXCHANGE = 'studio';
export const STUDIO_DLX = 'studio.dlx';
export const STUDIO_RETRY_EXCHANGE = 'studio.retry';

export const RETRY_DELAYS_MS = [0, 5_000, 30_000, 120_000] as const;
export const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;

export type StudioQueue =
  | 'story.generate'
  | 'story.validate'
  | 'asset.generate'
  | 'asset.validate'
  | 'audio.generate'
  | 'audio.transcribe'
  | 'audio.mix'
  | 'animation.plan'
  | 'animation.render'
  | 'animation.render.2d'
  | 'animation.render.3d'
  | 'animation.render.ai'
  | 'video.compose'
  | 'video.encode'
  | 'qa.inspect'
  | 'qa.approve'
  | 'qa.reject'
  | 'publish.youtube'
  | 'publish.instagram'
  | 'publish.facebook'
  | 'publish.tiktok';

export interface QueueDefinition {
  name: StudioQueue;
  prefetch: number;
  gpuBound: boolean;
  timeoutMs: number;
}

export const QUEUE_DEFINITIONS: readonly QueueDefinition[] = [
  { name: 'story.generate', prefetch: 4, gpuBound: false, timeoutMs: 300_000 },
  { name: 'story.validate', prefetch: 8, gpuBound: false, timeoutMs: 120_000 },
  { name: 'asset.generate', prefetch: 1, gpuBound: true, timeoutMs: 900_000 },
  { name: 'asset.validate', prefetch: 4, gpuBound: false, timeoutMs: 120_000 },
  { name: 'audio.generate', prefetch: 1, gpuBound: true, timeoutMs: 600_000 },
  { name: 'audio.transcribe', prefetch: 1, gpuBound: true, timeoutMs: 600_000 },
  { name: 'audio.mix', prefetch: 2, gpuBound: false, timeoutMs: 600_000 },
  { name: 'animation.plan', prefetch: 4, gpuBound: false, timeoutMs: 300_000 },
  { name: 'animation.render', prefetch: 1, gpuBound: true, timeoutMs: 7_200_000 },
  { name: 'animation.render.2d', prefetch: 1, gpuBound: false, timeoutMs: 3_600_000 },
  { name: 'animation.render.3d', prefetch: 1, gpuBound: true, timeoutMs: 7_200_000 },
  { name: 'animation.render.ai', prefetch: 1, gpuBound: true, timeoutMs: 7_200_000 },
  { name: 'video.compose', prefetch: 2, gpuBound: false, timeoutMs: 1_800_000 },
  { name: 'video.encode', prefetch: 2, gpuBound: false, timeoutMs: 1_800_000 },
  { name: 'qa.inspect', prefetch: 4, gpuBound: false, timeoutMs: 600_000 },
  { name: 'qa.approve', prefetch: 8, gpuBound: false, timeoutMs: 60_000 },
  { name: 'qa.reject', prefetch: 8, gpuBound: false, timeoutMs: 60_000 },
  { name: 'publish.youtube', prefetch: 1, gpuBound: false, timeoutMs: 3_600_000 },
  { name: 'publish.instagram', prefetch: 2, gpuBound: false, timeoutMs: 1_800_000 },
  { name: 'publish.facebook', prefetch: 2, gpuBound: false, timeoutMs: 1_800_000 },
  { name: 'publish.tiktok', prefetch: 1, gpuBound: false, timeoutMs: 1_800_000 },
];

export function queueDefinition(name: StudioQueue): QueueDefinition {
  const found = QUEUE_DEFINITIONS.find(definition => definition.name === name);
  if (!found) {
    throw new Error(`unknown studio queue: ${name}`);
  }
  return found;
}

export function retryQueueName(delayMs: number): string {
  return `studio.retry.${delayMs}`;
}

export function deadLetterQueueName(queue: StudioQueue): string {
  return `${queue}.dead`;
}
