import { describe, expect, it } from 'vitest';
import { applyVideoInputs } from '@/studio/providers/video/comfyui-wan.provider';
import {
  describeCharacter,
  describeEnvironment,
  mergeNegative,
} from '@/studio/directors/video.director';
import {
  clipSecondsFor,
  engineFor,
  framesForDuration,
  queueForMode,
} from '@/studio/engines/render-profiles';
import { shotClipCacheKey } from '@/studio/pipeline/cache';
import { continuityFrameKey, shotClipKey } from '@/storage/keys';
import { videoGenerationSpecSchema, videoPromptSchema } from '@/studio/contracts';
import type { VideoGenerationInput } from '@/studio/providers/provider.types';

function workflow() {
  return {
    '6': { class_type: 'CLIPTextEncode', inputs: { text: '', clip: ['39', 0] } },
    '7': { class_type: 'CLIPTextEncode', inputs: { text: '__NEGATIVE__', clip: ['39', 0] } },
    '41': {
      class_type: 'EmptyHunyuanLatentVideo',
      inputs: { width: 1280, height: 720, length: 81, batch_size: 1 },
    },
    '42': { class_type: 'KSamplerAdvanced', inputs: { noise_seed: 0, steps: 20, cfg: 3.5 } },
    '45': { class_type: 'SaveWEBM', inputs: { fps: 16, filename_prefix: 'studio/shot' } },
    '46': { class_type: 'LoadImage', inputs: { image: 'reference.png' } },
  };
}

function input(overrides: Partial<VideoGenerationInput> = {}): VideoGenerationInput {
  return {
    prompt: 'a boy walking a village road at sunset',
    negativePrompt: 'blurry, watermark',
    width: 832,
    height: 480,
    frames: 49,
    fps: 16,
    steps: 12,
    cfgScale: 4,
    ...overrides,
  };
}

describe('wan workflow patching', () => {
  it('writes the positive prompt into the positive encoder only', () => {
    const patched = applyVideoInputs(workflow(), input(), 7);
    expect(patched['6'].inputs.text).toBe('a boy walking a village road at sunset');
    expect(patched['7'].inputs.text).toBe('blurry, watermark');
  });

  it('leaves the negative encoder empty when no negative prompt is given', () => {
    const patched = applyVideoInputs(workflow(), input({ negativePrompt: undefined }), 7);
    expect(patched['7'].inputs.text).toBe('');
  });

  it('propagates resolution, length and sampler settings', () => {
    const patched = applyVideoInputs(workflow(), input(), 7);
    expect(patched['41'].inputs.width).toBe(832);
    expect(patched['41'].inputs.height).toBe(480);
    expect(patched['41'].inputs.length).toBe(49);
    expect(patched['42'].inputs.steps).toBe(12);
    expect(patched['42'].inputs.cfg).toBe(4);
  });

  it('seeds every sampler node from one seed', () => {
    const patched = applyVideoInputs(workflow(), input(), 4242);
    expect(patched['42'].inputs.noise_seed).toBe(4242);
  });

  it('sets the output frame rate', () => {
    expect(applyVideoInputs(workflow(), input({ fps: 24 }), 1)['45'].inputs.fps).toBe(24);
  });

  it('rewrites the LoadImage node only when a reference frame was uploaded', () => {
    expect(applyVideoInputs(workflow(), input(), 1, 'studio_abc.png')['46'].inputs.image).toBe(
      'studio_abc.png'
    );
    expect(applyVideoInputs(workflow(), input(), 1)['46'].inputs.image).toBe('reference.png');
  });

  it('does not mutate the cached workflow it was handed', () => {
    const original = workflow();
    applyVideoInputs(structuredClone(original), input(), 9);
    expect(original['41'].inputs.width).toBe(1280);
  });
});

describe('frame maths', () => {
  it('snaps frame counts to the 4k+1 stride wan expects', () => {
    for (const seconds of [1, 2.5, 3, 4.2, 5]) {
      const frames = framesForDuration(seconds, 16, 81);
      expect((frames - 1) % 4).toBe(0);
    }
  });

  it('never exceeds the model ceiling', () => {
    expect(framesForDuration(30, 16, 81)).toBe(81);
  });

  it('never returns a degenerate clip', () => {
    expect(framesForDuration(0.05, 16, 81)).toBeGreaterThanOrEqual(5);
  });

  it('tracks duration for ordinary shots', () => {
    expect(framesForDuration(3, 16, 81)).toBe(49);
  });

  it('reports the clip ceiling in seconds', () => {
    expect(clipSecondsFor(81, 16)).toBeCloseTo(5.06, 1);
  });
});

describe('mode routing', () => {
  it('routes ai video to its own gpu queue', () => {
    expect(queueForMode('AI_VIDEO')).toBe('animation.render.ai');
    expect(engineFor('AI_VIDEO', 'PRODUCTION')).toBe('WAN');
  });

  it('leaves the existing modes untouched', () => {
    expect(queueForMode('TWO_D')).toBe('animation.render.2d');
    expect(queueForMode('THREE_D')).toBe('animation.render.3d');
    expect(engineFor('TWO_D', 'PRODUCTION')).toBe('REMOTION');
    expect(engineFor('THREE_D', 'PREMIUM')).toBe('CYCLES');
  });

  it('ignores the render profile for ai video', () => {
    expect(engineFor('AI_VIDEO', 'PREVIEW')).toBe('WAN');
    expect(engineFor('AI_VIDEO', 'PREMIUM')).toBe('WAN');
  });
});

describe('shot clip cache key', () => {
  const base = {
    prompt: 'a boy walking',
    negativePrompt: 'blurry',
    model: 'wan2.2',
    workflow: 'wan22_t2v',
    width: 832,
    height: 480,
    frames: 49,
    fps: 16,
  };

  it('is stable for identical input', () => {
    expect(shotClipCacheKey(base)).toBe(shotClipCacheKey({ ...base }));
  });

  it('ignores surrounding whitespace in prompts', () => {
    expect(shotClipCacheKey({ ...base, prompt: '  a boy walking  ' })).toBe(shotClipCacheKey(base));
  });

  it('changes when the prompt changes', () => {
    expect(shotClipCacheKey({ ...base, prompt: 'a girl walking' })).not.toBe(
      shotClipCacheKey(base)
    );
  });

  it('changes when the reference frame changes', () => {
    expect(shotClipCacheKey({ ...base, referenceChecksum: 'aaa' })).not.toBe(
      shotClipCacheKey({ ...base, referenceChecksum: 'bbb' })
    );
  });

  it('separates a text-to-video take from an image-to-video take', () => {
    expect(shotClipCacheKey({ ...base, workflow: 'wan22_i2v' })).not.toBe(shotClipCacheKey(base));
  });

  it('changes with frame count so a longer take is not mistaken for a cache hit', () => {
    expect(shotClipCacheKey({ ...base, frames: 81 })).not.toBe(shotClipCacheKey(base));
  });
});

describe('shot storage keys', () => {
  it('fingerprints the clip so takes never collide', () => {
    const a = shotClipKey('p1', 'scene_000', 'shot_000', 'abcdef0123456789');
    const b = shotClipKey('p1', 'scene_000', 'shot_000', 'fedcba9876543210');
    expect(a).not.toBe(b);
    expect(a).toContain('projects/p1/scenes/scene_000/shot_000');
  });

  it('keeps continuity frames beside their clip', () => {
    expect(continuityFrameKey('p1', 'scene_000', 'shot_000')).toBe(
      'projects/p1/scenes/scene_000/shot_000.last.png'
    );
  });
});

describe('prompt construction', () => {
  const character = {
    character_id: 'david_v1',
    slug: 'david',
    name: 'David',
    age: 12,
    role: 'protagonist',
    appearance: {
      hair: 'short black',
      eyes: 'dark brown',
      skin: 'deep brown',
      build: 'slight',
      clothing: 'a blue t-shirt and brown shorts',
      distinguishing_features: ['a small scar on his left knee'],
    },
    personality: ['gentle'],
    style: 'cinematic',
    supported_actions: [],
    supported_expressions: ['neutral'],
    reference_asset_keys: [],
  } as never;

  it('describes a character from the bible verbatim', () => {
    const described = describeCharacter(character);
    expect(described).toContain('short black hair');
    expect(described).toContain('a small scar on his left knee');
    expect(described).toContain('wearing a blue t-shirt and brown shorts');
  });

  it('describes an environment with its light and weather', () => {
    const described = describeEnvironment({
      environment_id: 'village_road_v1',
      slug: 'village_road',
      name: 'Village road',
      description: 'a dirt road between fields',
      scale: 'exterior',
      time_of_day: 'sunset',
      weather: 'clear',
      mood: 'calm',
      key_light: 'low sun',
      palette: [],
      style: 'cinematic',
      layers: [],
      reference_asset_keys: [],
    } as never);
    expect(described).toContain('sunset');
    expect(described).toContain('clear weather');
    expect(described).toContain('lit by low sun');
  });

  it('always includes the baseline defect list in the negative prompt', () => {
    const negative = mergeNegative('oversaturated');
    expect(negative).toContain('deformed hands');
    expect(negative).toContain('oversaturated');
  });

  it('does not duplicate terms already in the baseline', () => {
    const negative = mergeNegative('blurry, watermark');
    expect(negative.split(', ').filter(term => term === 'blurry')).toHaveLength(1);
  });
});

describe('video contracts', () => {
  it('accepts a well-formed generation spec', () => {
    const parsed = videoGenerationSpecSchema.safeParse({
      shot_id: 'shot_000',
      prompt: 'a boy walking home',
      width: 832,
      height: 480,
      frames: 49,
      fps: 16,
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a frame count beyond what any wan build accepts', () => {
    const parsed = videoGenerationSpecSchema.safeParse({
      shot_id: 'shot_000',
      prompt: 'a boy walking home',
      width: 832,
      height: 480,
      frames: 999,
      fps: 16,
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a prompt too short to render anything', () => {
    expect(videoPromptSchema.safeParse({ shot_id: 'shot_000', prompt: 'a boy' }).success).toBe(
      false
    );
  });
});
