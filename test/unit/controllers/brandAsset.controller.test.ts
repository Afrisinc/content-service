import { decodeUpload, referenceFromUrl } from '@/controllers/brandAsset.controller';
import { describe, expect, it } from 'vitest';

/**
 * Typing a reference per photograph is the reason a library stays at one image,
 * so a pasted url has to be enough on its own.
 */
describe('referenceFromUrl', () => {
  it('takes the filename', () => {
    expect(referenceFromUrl('https://cdn.example/photos/Bench-Repair.JPG', 0)).toBe('bench-repair');
  });

  it('ignores a query string', () => {
    expect(referenceFromUrl('https://cdn.example/a/office.png?w=1200&v=2', 0)).toBe('office');
  });

  it('collapses punctuation into single separators', () => {
    expect(referenceFromUrl('https://cdn.example/a/team__at%20work..jpg', 0)).toBe(
      'team-at-20work'
    );
  });

  it('falls back to a numbered name when the url has no usable filename', () => {
    expect(referenceFromUrl('https://cdn.example/', 0)).toBe('photo-1');
    expect(referenceFromUrl('https://cdn.example/', 4)).toBe('photo-5');
  });

  it('keeps a reference short enough for the column', () => {
    const long = `https://cdn.example/${'a'.repeat(300)}.jpg`;

    expect(referenceFromUrl(long, 0).length).toBeLessThanOrEqual(60);
  });

  it('gives two different photographs two different references', () => {
    expect(referenceFromUrl('https://cdn.example/a/bench.jpg', 0)).not.toBe(
      referenceFromUrl('https://cdn.example/a/office.jpg', 1)
    );
  });
});

describe('decodeUpload', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

  it('decodes a bare base64 payload', () => {
    expect(decodeUpload(png.toString('base64'))).toEqual(png);
  });

  it('decodes a data url, prefix and all', () => {
    // Which is what a browser FileReader hands back.
    const dataUrl = `data:image/png;base64,${png.toString('base64')}`;

    expect(decodeUpload(dataUrl)).toEqual(png);
  });

  it('returns nothing for an empty payload, so the caller can reject it', () => {
    expect(decodeUpload('').length).toBe(0);
  });
});
