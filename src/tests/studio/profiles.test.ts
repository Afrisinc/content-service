import { describe, expect, it } from 'vitest';
import {
  FORMAT_DIMENSIONS,
  engineFor,
  formatsForPlatforms,
  masterSettings,
  qualityThresholdsFor,
  variantSpecs,
} from '@/studio/engines/render-profiles';
import {
  areaKey,
  cacheKeyOf,
  checksumOf,
  contentAddressedKey,
  safeSegment,
  variantKey,
} from '@/storage/keys';

describe('render profiles', () => {
  it('routes 2d productions to remotion', () => {
    expect(engineFor('TWO_D', 'PRODUCTION')).toBe('REMOTION');
    expect(engineFor('TWO_D', 'PREMIUM')).toBe('REMOTION');
  });

  it('uses eevee for everyday 3d and cycles only for premium', () => {
    expect(engineFor('THREE_D', 'PRODUCTION')).toBe('EEVEE');
    expect(engineFor('THREE_D', 'PREMIUM')).toBe('CYCLES');
  });

  it('raises sample count with the profile', () => {
    expect(masterSettings('THREE_D', 'PREVIEW').samples).toBeLessThan(
      masterSettings('THREE_D', 'PREMIUM').samples
    );
  });

  it('derives formats from the requested platforms', () => {
    expect(formatsForPlatforms(['tiktok'], [])).toEqual(['VERTICAL_9_16']);
    expect(formatsForPlatforms(['youtube'], [])).toContain('LANDSCAPE_16_9');
  });

  it('deduplicates formats across platforms', () => {
    const formats = formatsForPlatforms(['instagram', 'tiktok'], []);
    expect(new Set(formats).size).toBe(formats.length);
  });

  it('honours explicitly requested formats over platform defaults', () => {
    expect(formatsForPlatforms(['tiktok'], ['SQUARE_1_1'])).toEqual(['SQUARE_1_1']);
  });

  it('falls back to landscape and vertical when nothing is specified', () => {
    expect(formatsForPlatforms([], [])).toEqual(['LANDSCAPE_16_9', 'VERTICAL_9_16']);
  });

  it('burns subtitles into vertical formats but not landscape', () => {
    expect(FORMAT_DIMENSIONS.VERTICAL_9_16.burnSubtitles).toBe(true);
    expect(FORMAT_DIMENSIONS.LANDSCAPE_16_9.burnSubtitles).toBe(false);
  });

  it('emits one variant spec per format with matching dimensions', () => {
    const specs = variantSpecs(['LANDSCAPE_16_9', 'VERTICAL_9_16']);
    expect(specs).toHaveLength(2);
    expect(specs[0]).toMatchObject({ format: '16:9', width: 1920, height: 1080 });
    expect(specs[1]).toMatchObject({ format: '9:16', width: 1080, height: 1920 });
  });

  it('scales the duration tolerance with the film length', () => {
    expect(qualityThresholdsFor('LANDSCAPE_16_9', 600).max_duration_drift_seconds).toBeGreaterThan(
      qualityThresholdsFor('LANDSCAPE_16_9', 30).max_duration_drift_seconds
    );
  });
});

describe('storage keys', () => {
  it('scopes every key under its production', () => {
    expect(areaKey('p1', 'renders', 'scene_000.mp4')).toBe('projects/p1/renders/scene_000.mp4');
  });

  it('strips characters that would break an object key', () => {
    expect(safeSegment('a/b c:d')).toBe('a-b-c-d');
    expect(safeSegment('///')).toBe('unnamed');
  });

  it('replaces the colon in an aspect ratio', () => {
    expect(variantKey('p1', 'tiktok', '9:16')).toBe('projects/p1/platform/tiktok_9x16.mp4');
  });

  it('shards content-addressed keys by checksum prefix', () => {
    expect(contentAddressedKey('character', 'abcdef123', 'png')).toBe(
      'library/character/ab/abcdef123.png'
    );
  });

  it('hashes identical buffers to the same checksum', () => {
    expect(checksumOf(Buffer.from('x'))).toBe(checksumOf(Buffer.from('x')));
    expect(checksumOf(Buffer.from('x'))).not.toBe(checksumOf(Buffer.from('y')));
  });

  it('produces an order-independent cache key', () => {
    expect(cacheKeyOf({ a: 1, b: 2 })).toBe(cacheKeyOf({ b: 2, a: 1 }));
  });
});
