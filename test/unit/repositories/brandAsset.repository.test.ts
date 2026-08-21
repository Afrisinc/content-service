import { BrandAssetRepository } from '@/repositories/brandAsset.repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakePrisma() {
  return {
    brandAsset: {
      create: vi.fn(async () => ({ id: 'set-1', images: [] })),
      findUnique: vi.fn(async () => ({ id: 'set-1', images: [] })),
    },
    brandAssetImage: {
      createMany: vi.fn(async () => ({ count: 2 })),
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
}

let prisma: ReturnType<typeof fakePrisma>;
let repository: BrandAssetRepository;

beforeEach(() => {
  prisma = fakePrisma();
  repository = new BrandAssetRepository(prisma as never);
});

describe('create', () => {
  /**
   * The bug this pins: `kind` and `approved` moved to the set when a brand asset
   * became a set of photographs, but the upload path kept sending them per
   * image. Prisma rejected the whole write with "Unknown argument `kind`".
   */
  it('sends set fields on the set and image fields on the images', async () => {
    await repository.create({
      name: 'Repair bench shots',
      kind: 'photo',
      approved: false,
      images: [
        { url: 'https://cdn/a.png', reference: 'a' },
        { url: 'https://cdn/b.png', reference: 'b', subjects: ['bench'] },
      ],
    });

    const call = prisma.brandAsset.create.mock.calls[0][0] as {
      data: { kind: string; images: { create: Array<Record<string, unknown>> } };
    };

    expect(call.data.kind).toBe('photo');
    for (const image of call.data.images.create) {
      expect(image).not.toHaveProperty('kind');
      expect(image).not.toHaveProperty('approved');
      expect(image).toHaveProperty('url');
      expect(image).toHaveProperty('reference');
    }
  });

  it('creates the set and its photographs in one write', async () => {
    await repository.create({
      name: 'One shot',
      images: [{ url: 'https://cdn/a.png', reference: 'a' }],
    });

    expect(prisma.brandAsset.create).toHaveBeenCalledOnce();
    expect(prisma.brandAssetImage.createMany).not.toHaveBeenCalled();
  });
});

describe('findCandidates', () => {
  it('scopes to a brand when one is named', async () => {
    await repository.findCandidates(['bench'], 'group-1');

    const where = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { asset: { groups?: unknown; approved: boolean } };
    };

    expect(where.where.asset.approved).toBe(true);
    expect(where.where.asset.groups).toEqual({ some: { groupId: 'group-1' } });
  });

  it('draws from every approved set when no brand is named', async () => {
    await repository.findCandidates([]);

    const where = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { asset: { groups?: unknown } };
    };

    expect(where.where.asset.groups).toBeUndefined();
  });

  it('rotates least-recently-used first', async () => {
    await repository.findCandidates([]);

    const call = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, unknown>>;
    };

    expect(call.orderBy[0]).toHaveProperty('lastUsedAt');
  });
});

describe('recordUse', () => {
  it('counts usage per photograph, not per set', async () => {
    await repository.recordUse(['image-1', 'image-2']);

    expect(prisma.brandAssetImage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['image-1', 'image-2'] } } })
    );
  });

  it('does nothing when nothing was used', async () => {
    await repository.recordUse([]);

    expect(prisma.brandAssetImage.updateMany).not.toHaveBeenCalled();
  });
});
