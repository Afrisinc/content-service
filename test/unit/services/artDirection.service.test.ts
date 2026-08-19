import { ArtDirectionService } from '@/services/artDirection.service';
import { PostCopy } from '@/types/post.types';
import { BadRequestError } from '@/utils/http-error';
import { describe, expect, it, vi } from 'vitest';

interface FakeAsset {
  id: string;
  reference: string;
}

function fakeRepository(assets: FakeAsset[]) {
  return {
    findCandidates: vi.fn(async () => assets),
    recordUse: vi.fn(async () => undefined),
    create: vi.fn(),
    findByReference: vi.fn(),
  };
}

function copyWithPhotoSlides(): PostCopy {
  return {
    concept: 'concept',
    caption: 'caption',
    hashtags: ['#AFRISINC'],
    claims: [],
    slides: [
      { role: 'hook', eyebrow: 'A', eyebrowKind: 'label', headline: ['one'] },
      {
        role: 'proof',
        eyebrow: 'B',
        eyebrowKind: 'claim',
        headline: ['two'],
        photoSubjects: ['bench'],
      },
      { role: 'method', eyebrow: 'C', eyebrowKind: 'label', headline: ['three'] },
      {
        role: 'differentiator',
        eyebrow: 'D',
        eyebrowKind: 'claim',
        headline: ['four'],
        photoSubjects: ['network'],
      },
      { role: 'cta', eyebrow: 'E', eyebrowKind: 'claim', headline: ['five'], cta: 'afrisinc.com' },
    ],
  };
}

describe('ArtDirectionService', () => {
  it('assigns a photo to every photo-role slide', async () => {
    const repo = fakeRepository([
      { id: '1', reference: 'bench.png' },
      { id: '2', reference: 'network.png' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides());

    expect(Object.keys(result.photosByIndex).sort()).toEqual(['1', '3']);
    expect(result.assetIds).toHaveLength(2);
  });

  it('never uses the same photograph twice in one carousel', async () => {
    const repo = fakeRepository([
      { id: '1', reference: 'bench.png' },
      { id: '2', reference: 'network.png' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides());

    expect(result.photosByIndex[1]).not.toBe(result.photosByIndex[3]);
  });

  it('fails loudly when the library cannot cover the carousel', async () => {
    const repo = fakeRepository([{ id: '1', reference: 'bench.png' }]);
    const service = new ArtDirectionService(repo as never);

    await expect(service.assignPhotos(copyWithPhotoSlides())).rejects.toThrow(BadRequestError);
  });

  it('does not touch the library when no slide needs a photograph', async () => {
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);
    const copy = copyWithPhotoSlides();
    copy.slides = copy.slides.filter(slide => slide.role !== 'proof' && slide.role !== 'differentiator');

    const result = await service.assignPhotos(copy);

    expect(result).toEqual({ photosByIndex: {}, assetIds: [] });
    expect(repo.findCandidates).not.toHaveBeenCalled();
  });

  it('records use so the same image rotates out', async () => {
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);

    await service.recordUse(['1', '2']);

    expect(repo.recordUse).toHaveBeenCalledWith(['1', '2']);
  });
});
