import { applyVariation, makeVariation, seedFrom, varySlide } from '@/helpers/composition.helper';
import { PostSlideSpec } from '@/types/post.types';
import { describe, expect, it } from 'vitest';

const OPEN = { canTakeCoral: true };

function drawMany(slug: string, count = 40) {
  const next = makeVariation(slug);
  return Array.from({ length: count }, () => varySlide(next, OPEN));
}

describe('seedFrom', () => {
  it('is stable for the same slug', () => {
    expect(seedFrom('repair-abc123')).toBe(seedFrom('repair-abc123'));
  });

  it('separates slugs that differ by one character', () => {
    expect(seedFrom('repair-abc123')).not.toBe(seedFrom('repair-abc124'));
  });
});

describe('makeVariation', () => {
  /**
   * The reason this is seeded rather than random: a draft is re-rendered on
   * resume and on demand, and it must reproduce the artwork that was approved.
   */
  it('replays the same sequence for the same post', () => {
    expect(drawMany('repair-abc123')).toEqual(drawMany('repair-abc123'));
  });

  it('composes a different post differently', () => {
    expect(drawMany('repair-abc123')).not.toEqual(drawMany('uptime-def456'));
  });

  it('stays inside the allowed values', () => {
    for (const variation of drawMany('repair-abc123')) {
      expect(['top', 'centre', 'bottom']).toContain(variation.anchor);
      expect(variation.photoFocus).toBeGreaterThanOrEqual(0);
      expect(variation.photoFocus).toBeLessThanOrEqual(1);
    }
  });

  it('actually varies rather than settling on one answer', () => {
    const anchors = new Set(drawMany('repair-abc123').map(variation => variation.anchor));
    expect(anchors.size).toBeGreaterThan(1);
  });

  it('survives a slug that hashes to zero', () => {
    expect(() => makeVariation('')()).not.toThrow();
    expect(Number.isFinite(makeVariation('')())).toBe(true);
  });
});

describe('varySlide', () => {
  it('never spends the coral budget twice', () => {
    const next = makeVariation('repair-abc123');

    for (let index = 0; index < 40; index += 1) {
      expect(varySlide(next, { ...OPEN, canTakeCoral: false }).coralRule).toBe(false);
    }
  });

  it('keeps the coral rule occasional rather than habitual', () => {
    const rate =
      drawMany('repair-abc123', 200).filter(variation => variation.coralRule).length / 200;

    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(0.6);
  });
});

describe('applyVariation', () => {
  const photoSlide: PostSlideSpec = { surface: 'photo', photo: 'a.jpg', headline: ['one'] };
  const flatSlide: PostSlideSpec = { surface: 'azure', headline: ['one'] };

  it('crops a photograph off-centre without moving its surface', () => {
    const varied = applyVariation(photoSlide, {
      anchor: 'top',
      photoFocus: 0.65,
      coralRule: false,
    });

    expect(varied.surface).toBe('photo');
    expect(varied.photo_focus).toBe(0.65);
    expect(varied.anchor).toBe('top');
  });

  /**
   * The renderer enforces the surface rhythm as a brand rule — first and last
   * frame azure, never two azure adjacent. Varying it produced specs the render
   * service rejected outright, so composition leaves surfaces alone.
   */
  it('never moves a surface, whatever the frame', () => {
    for (const slide of [photoSlide, flatSlide]) {
      const varied = applyVariation(slide, {
        anchor: 'bottom',
        photoFocus: 0.5,
        coralRule: false,
      });

      expect(varied.surface).toBe(slide.surface);
    }
  });

  it('never sets photo_focus on a frame with no photograph', () => {
    const varied = applyVariation(flatSlide, {
      anchor: 'centre',
      photoFocus: 0.35,
      coralRule: false,
    });

    expect(varied.photo_focus).toBeUndefined();
  });

  it('leaves a row list on white', () => {
    const rowSlide: PostSlideSpec = {
      surface: 'white',
      headline: ['one'],
      rows: [{ title: 'A', body: 'b' }],
    };

    const varied = applyVariation(rowSlide, {
      anchor: 'top',
      photoFocus: 0.5,
      coralRule: false,
    });

    expect(varied.surface).toBe('white');
    expect(varied.rows).toHaveLength(1);
  });

  it('does not mutate the slide it was handed', () => {
    applyVariation(flatSlide, {
      anchor: 'top',
      photoFocus: 0.65,
      coralRule: true,
    });

    expect(flatSlide.surface).toBe('azure');
    expect(flatSlide.anchor).toBeUndefined();
  });
});
