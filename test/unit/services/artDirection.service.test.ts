import { ArtDirectionService } from '@/services/artDirection.service';
import { PostCopy } from '@/types/post.types';
import { BadRequestError } from '@/utils/http-error';
import { describe, expect, it, vi } from 'vitest';

const USER = 'user-1';

interface FakeAsset {
  id: string;
  reference: string;
  url?: string;
  subjects?: string[];
}

function fakeRepository(assets: FakeAsset[]) {
  const withSubjects = assets.map(asset => ({ subjects: [], ...asset }));
  return {
    countForGroup: vi.fn(async () => 0),
    findCandidates: vi.fn(async () => withSubjects),
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

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(Object.keys(result.photosByIndex).sort()).toEqual(['1', '3']);
    expect(result.assetIds).toHaveLength(2);
  });

  it('never uses the same photograph twice in one carousel', async () => {
    const repo = fakeRepository([
      { id: '1', reference: 'bench.png' },
      { id: '2', reference: 'network.png' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).not.toBe(result.photosByIndex[3]);
  });

  it('shares the one photograph it has rather than failing the whole post', async () => {
    // A young workspace with a single approved image is the normal state, not an
    // error. A repeated photograph beats no post at all.
    const repo = fakeRepository([{ id: '1', reference: 'bench.png' }]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).toBe('bench.png');
    expect(result.photosByIndex[3]).toBe('bench.png');
    expect(result.assetIds).toEqual(['1']);
    expect(result.reused).toBe(1);
  });

  it('fails only when the library holds no approved photograph at all', async () => {
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);

    await expect(service.assignPhotos(copyWithPhotoSlides(), USER)).rejects.toThrow(
      BadRequestError
    );
    await expect(service.assignPhotos(copyWithPhotoSlides(), USER)).rejects.toThrow(
      /no approved photograph in the brand asset library/
    );
  });

  it('falls back to an off-subject photograph rather than failing', async () => {
    // Nothing in the library is tagged "bench" or "network" — the copy agent
    // invented subjects nothing carries — so it takes any approved photograph.
    const repo = fakeRepository([{ id: '9', reference: 'office.png' }]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).toBe('office.png');
    expect(result.assetIds).toEqual(['9']);
  });

  it('prefers an on-subject photograph when one exists', async () => {
    const repo = fakeRepository([
      { id: '1', reference: 'bench.png', subjects: ['bench'] },
      { id: '2', reference: 'generic-a.png' },
      { id: '3', reference: 'generic-b.png' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).toBe('bench.png');
    // The differentiator slide asked for "network", which nothing carries, so it
    // takes an unused approved photograph instead of repeating the bench.
    expect(result.photosByIndex[3]).not.toBe('bench.png');
    expect(result.reused).toBe(0);
  });

  it('matches a subject regardless of case or stray whitespace', async () => {
    const repo = fakeRepository([{ id: '1', reference: 'bench.png', subjects: [' Bench '] }]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).toBe('bench.png');
  });

  it('still leaves a one-frame post on azure when the library is empty', async () => {
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);
    const copy = copyWithPhotoSlides();
    copy.slides = [copy.slides[1]];

    const result = await service.assignPhotos(copy, USER);

    expect(result).toEqual({ photosByIndex: {}, assetIds: [], reused: 0 });
  });

  it('does not touch the library when no slide needs a photograph', async () => {
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);
    const copy = copyWithPhotoSlides();
    copy.slides = copy.slides.filter(
      slide => slide.role !== 'proof' && slide.role !== 'differentiator'
    );

    const result = await service.assignPhotos(copy, USER);

    expect(result).toEqual({ photosByIndex: {}, assetIds: [], reused: 0 });
    expect(repo.findCandidates).not.toHaveBeenCalled();
  });

  it('sends the stored url, because the renderer cannot see this service’s uploads', async () => {
    const repo = fakeRepository([
      { id: '1', reference: 'business-image-01', url: 'https://cdn.example/photo-a.jpg' },
      { id: '2', reference: 'business-image-02', url: 'https://cdn.example/photo-b.jpg' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).toBe('https://cdn.example/photo-a.jpg');
    expect(result.photosByIndex[3]).toBe('https://cdn.example/photo-b.jpg');
  });

  it('falls back to the bare reference for a photograph shipped with the renderer', async () => {
    const repo = fakeRepository([
      { id: '1', reference: 'bench.png', url: '' },
      { id: '2', reference: 'network.png' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(result.photosByIndex[1]).toBe('bench.png');
    expect(result.photosByIndex[3]).toBe('network.png');
  });

  it('records use so the same image rotates out', async () => {
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);

    await service.recordUse(['1', '2']);

    expect(repo.recordUse).toHaveBeenCalledWith(['1', '2']);
  });
});

describe('a brand with its own photographs', () => {
  function trackingRepository(
    byGroup: Record<string, FakeAsset[]>,
    shared: FakeAsset[],
    count = 1
  ) {
    const withSubjects = (assets: FakeAsset[]) => assets.map(asset => ({ subjects: [], ...asset }));
    return {
      countForGroup: vi.fn(async () => count),
      findCandidates: vi.fn(async (_subjects: string[], _userId: string, groupId?: string) =>
        withSubjects(groupId ? (byGroup[groupId] ?? []) : shared)
      ),
      recordUse: vi.fn(async () => undefined),
      create: vi.fn(),
      findByReference: vi.fn(),
    };
  }

  it('draws only from the brand’s library when it has one', async () => {
    const repo = trackingRepository({ 'group-1': [{ id: 'b1', reference: 'brand-a.png' }] }, [
      { id: 's1', reference: 'shared.png' },
    ]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER, 'group-1');

    expect(result.photosByIndex[1]).toBe('brand-a.png');
    expect(result.assetIds).toEqual(['b1']);
  });

  it('falls back to the account’s own library when the brand has none', async () => {
    const repo = trackingRepository({}, [{ id: 's1', reference: 'shared.png' }], 0);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER, 'group-1');

    // countForGroup returned 0, so the brand scope is dropped entirely.
    expect(result.photosByIndex[1]).toBe('shared.png');
    expect(repo.findCandidates).toHaveBeenCalledWith(expect.anything(), USER, undefined, undefined);
  });

  it('uses the account’s own library when no brand is named at all', async () => {
    const repo = trackingRepository({}, [{ id: 's1', reference: 'shared.png' }]);
    const service = new ArtDirectionService(repo as never);

    await service.assignPhotos(copyWithPhotoSlides(), USER);

    expect(repo.countForGroup).not.toHaveBeenCalled();
    expect(repo.findCandidates).toHaveBeenCalledWith(expect.anything(), USER, undefined, undefined);
  });

  it('checks the brand library once, not once per frame', async () => {
    const repo = trackingRepository(
      {
        'group-1': [
          { id: 'b1', reference: 'a.png' },
          { id: 'b2', reference: 'b.png' },
        ],
      },
      []
    );
    const service = new ArtDirectionService(repo as never);

    await service.assignPhotos(copyWithPhotoSlides(), USER, 'group-1');

    expect(repo.countForGroup).toHaveBeenCalledOnce();
  });
});

describe('a post with hand-picked photographs', () => {
  function assetIdRepository(picked: FakeAsset[]) {
    const withSubjects = picked.map(asset => ({ subjects: [], ...asset }));
    return {
      countForGroup: vi.fn(async () => 5),
      findCandidates: vi.fn(
        async (_subjects: string[], _userId: string, _groupId?: string, assetIds?: string[]) =>
          assetIds?.length ? withSubjects : []
      ),
      recordUse: vi.fn(async () => undefined),
      create: vi.fn(),
      findByReference: vi.fn(),
    };
  }

  it('draws only from the selection, bypassing the group library entirely', async () => {
    const repo = assetIdRepository([{ id: 'p1', reference: 'picked.png' }]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(copyWithPhotoSlides(), USER, 'group-1', ['p1']);

    expect(result.photosByIndex[1]).toBe('picked.png');
    expect(repo.countForGroup).not.toHaveBeenCalled();
    expect(repo.findCandidates).toHaveBeenCalledWith(expect.anything(), USER, undefined, ['p1']);
  });
});

describe('a two-frame carousel', () => {
  function pair(): PostCopy {
    return {
      concept: 'concept',
      caption: 'caption',
      hashtags: ['#AFRISINC'],
      claims: [],
      slides: [
        { role: 'hook', eyebrow: 'HOOK', eyebrowKind: 'label', headline: ['one'] },
        { role: 'cta', eyebrow: 'TALK', eyebrowKind: 'label', headline: ['two'] },
      ],
    };
  }

  it('puts the photograph on the closing frame, not the opener', () => {
    // The opener is azure by brand rule, so a photograph there would be dropped.
    const repo = fakeRepository([{ id: '1', reference: 'bench.png' }]);
    const service = new ArtDirectionService(repo as never);

    const result = service.assignPhotos(pair(), USER);

    return result.then(assignment => {
      expect(assignment.photosByIndex[0]).toBeUndefined();
      expect(assignment.photosByIndex[1]).toBe('bench.png');
    });
  });

  it('still publishes a pair when the library is empty', async () => {
    // A pair closes on white without one, the same way a lone frame falls back.
    const repo = fakeRepository([]);
    const service = new ArtDirectionService(repo as never);

    const result = await service.assignPhotos(pair(), USER);

    expect(result).toEqual({ photosByIndex: {}, assetIds: [], reused: 0 });
  });
});
