import { createHash } from 'node:crypto';
import type { RenderProfile } from '@prisma/client';
import type { RenderSettings, SceneSpec } from '../contracts';

export interface SceneCacheInput {
  scene: SceneSpec;
  assetVersions: Record<string, number>;
  audioChecksums: Record<string, string>;
  engineVersion: string;
  profile: RenderProfile;
  settings: RenderSettings;
}

export function sceneCacheKey(input: SceneCacheInput): string {
  const canonical = JSON.stringify({
    scene: input.scene,
    assets: Object.keys(input.assetVersions)
      .sort()
      .map(key => [key, input.assetVersions[key]]),
    audio: Object.keys(input.audioChecksums)
      .sort()
      .map(key => [key, input.audioChecksums[key]]),
    engine: input.engineVersion,
    profile: input.profile,
    settings: input.settings,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function assetCacheKey(input: {
  prompt: string;
  negativePrompt?: string;
  model: string;
  seed?: number;
  width: number;
  height: number;
  workflow?: string;
}): string {
  const canonical = JSON.stringify({
    prompt: input.prompt.trim(),
    negative: (input.negativePrompt ?? '').trim(),
    model: input.model,
    seed: input.seed ?? null,
    size: [input.width, input.height],
    workflow: input.workflow ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function ttsCacheKey(input: {
  text: string;
  voiceId: string;
  engine: string;
  speed: number;
  pitch: number;
  language: string;
}): string {
  const canonical = JSON.stringify({
    text: input.text.trim(),
    voice: input.voiceId,
    engine: input.engine,
    speed: input.speed,
    pitch: input.pitch,
    language: input.language,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function shotClipCacheKey(input: {
  prompt: string;
  negativePrompt: string;
  model: string;
  workflow: string;
  seed?: number;
  width: number;
  height: number;
  frames: number;
  fps: number;
  referenceChecksum?: string;
}): string {
  const canonical = JSON.stringify({
    prompt: input.prompt.trim(),
    negative: input.negativePrompt.trim(),
    model: input.model,
    workflow: input.workflow,
    seed: input.seed ?? null,
    size: [input.width, input.height],
    frames: input.frames,
    fps: input.fps,
    reference: input.referenceChecksum ?? null,
  });
  return createHash('sha256').update(canonical).digest('hex');
}
