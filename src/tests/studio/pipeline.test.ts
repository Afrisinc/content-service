import { describe, expect, it } from 'vitest';
import {
  assertTransition,
  canTransition,
  isTerminal,
  nextStage,
  progressRatio,
} from '@/studio/pipeline/state-machine';
import { assetCacheKey, sceneCacheKey, ttsCacheKey } from '@/studio/pipeline/cache';
import type { RenderSettings, SceneSpec } from '@/studio/contracts';

const SETTINGS: RenderSettings = {
  width: 1920,
  height: 1080,
  fps: 30,
  samples: 64,
  engine: 'EEVEE',
  video_codec: 'h264',
  audio_codec: 'aac',
  crf: 18,
  transparent: false,
};

const SCENE = {
  scene_id: 'scene_000',
  index: 0,
  duration_seconds: 6,
  environment_id: 'village_v1',
  animation_mode: '3d',
  background_layers: [],
  shots: [],
} as unknown as SceneSpec;

function cacheInput(overrides: Record<string, unknown> = {}) {
  return {
    scene: SCENE,
    assetVersions: { david_v1: 1, village_v1: 2 },
    audioChecksums: { line_1: 'abc' },
    engineVersion: 'EEVEE',
    profile: 'PRODUCTION' as const,
    settings: SETTINGS,
    ...overrides,
  };
}

describe('production state machine', () => {
  it('allows the forward path through the pipeline', () => {
    expect(canTransition('DRAFT', 'PLANNING')).toBe(true);
    expect(canTransition('RENDERING', 'POST_PROCESSING')).toBe(true);
    expect(canTransition('APPROVED', 'PUBLISHING')).toBe(true);
  });

  it('refuses to skip stages', () => {
    expect(canTransition('DRAFT', 'PUBLISHED')).toBe(false);
    expect(canTransition('PLANNING', 'RENDERING')).toBe(false);
  });

  it('treats a same-status transition as a no-op', () => {
    expect(canTransition('RENDERING', 'RENDERING')).toBe(true);
  });

  it('throws a conflict on an illegal transition', () => {
    expect(() => assertTransition('PUBLISHED', 'RENDERING')).toThrow(/cannot move from PUBLISHED/);
  });

  it('lets a failed production retry but not resume directly', () => {
    expect(canTransition('FAILED', 'RETRYING')).toBe(true);
    expect(canTransition('FAILED', 'PUBLISHING')).toBe(false);
  });

  it('marks published and cancelled as terminal', () => {
    expect(isTerminal('PUBLISHED')).toBe(true);
    expect(isTerminal('CANCELLED')).toBe(true);
    expect(isTerminal('RENDERING')).toBe(false);
  });

  it('reports the next stage and stops at the end', () => {
    expect(nextStage('DRAFT')).toBe('PLANNING');
    expect(nextStage('PUBLISHED')).toBeNull();
    expect(nextStage('FAILED')).toBeNull();
  });

  it('reports progress between zero and one', () => {
    expect(progressRatio('DRAFT')).toBe(0);
    expect(progressRatio('PUBLISHED')).toBe(1);
    expect(progressRatio('RENDERING')).toBeGreaterThan(0.5);
    expect(progressRatio('FAILED')).toBe(0);
  });
});

describe('cache keys', () => {
  it('is stable for identical scene input', () => {
    expect(sceneCacheKey(cacheInput())).toBe(sceneCacheKey(cacheInput()));
  });

  it('ignores the ordering of asset and audio maps', () => {
    const reordered = cacheInput({ assetVersions: { village_v1: 2, david_v1: 1 } });
    expect(sceneCacheKey(reordered)).toBe(sceneCacheKey(cacheInput()));
  });

  it('changes when an asset version changes', () => {
    const bumped = cacheInput({ assetVersions: { david_v1: 2, village_v1: 2 } });
    expect(sceneCacheKey(bumped)).not.toBe(sceneCacheKey(cacheInput()));
  });

  it('changes when the render profile changes', () => {
    expect(sceneCacheKey(cacheInput({ profile: 'PREMIUM' }))).not.toBe(sceneCacheKey(cacheInput()));
  });

  it('changes when the engine version changes', () => {
    expect(sceneCacheKey(cacheInput({ engineVersion: 'CYCLES' }))).not.toBe(
      sceneCacheKey(cacheInput())
    );
  });

  it('treats the same prompt and seed as the same asset', () => {
    const input = { prompt: ' a boy ', model: 'sdxl', seed: 7, width: 1024, height: 1024 };
    expect(assetCacheKey(input)).toBe(assetCacheKey({ ...input, prompt: 'a boy' }));
  });

  it('separates assets that differ only by seed', () => {
    const input = { prompt: 'a boy', model: 'sdxl', seed: 7, width: 1024, height: 1024 };
    expect(assetCacheKey(input)).not.toBe(assetCacheKey({ ...input, seed: 8 }));
  });

  it('separates tts output that differs by voice', () => {
    const input = {
      text: 'hello',
      voiceId: 'a',
      engine: 'kokoro',
      speed: 1,
      pitch: 0,
      language: 'en',
    };
    expect(ttsCacheKey(input)).not.toBe(ttsCacheKey({ ...input, voiceId: 'b' }));
  });

  it('treats trimmed tts text as identical', () => {
    const input = {
      text: 'hello',
      voiceId: 'a',
      engine: 'kokoro',
      speed: 1,
      pitch: 0,
      language: 'en',
    };
    expect(ttsCacheKey(input)).toBe(ttsCacheKey({ ...input, text: '  hello  ' }));
  });
});
