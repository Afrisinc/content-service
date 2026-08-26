import { BrandAssetRepository } from '@/repositories/brandAsset.repository';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function fakePrisma() {
  return {
    brandAsset: {
      create: vi.fn(async () => ({ id: 'set-1', images: [] })),
      findUnique: vi.fn(async () => ({ id: 'set-1', images: [] })),
      findFirst: vi.fn(async () => ({ id: 'set-1', images: [] })),
      findMany: vi.fn(async () => []),
    },
    brandAssetImage: {
      createMany: vi.fn(async () => ({ count: 2 })),
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(async () => null),
      deleteMany: vi.fn(async () => ({ count: 1 })),
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
    await repository.findCandidates(['bench'], 'user-1', 'group-1');

    const where = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { asset: { groups?: unknown; approved: boolean } };
    };

    expect(where.where.asset.approved).toBe(true);
    expect(where.where.asset.groups).toEqual({ some: { groupId: 'group-1' } });
  });

  it('draws from every approved set when no brand is named', async () => {
    await repository.findCandidates([], 'user-1');

    const where = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { asset: { groups?: unknown } };
    };

    expect(where.where.asset.groups).toBeUndefined();
  });

  it('rotates least-recently-used first', async () => {
    await repository.findCandidates([], 'user-1');

    const call = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      orderBy: Array<Record<string, unknown>>;
    };

    expect(call.orderBy[0]).toHaveProperty('lastUsedAt');
  });

  /**
   * The bug this pins: assetIds carries brand asset *set* ids — the same ids
   * the asset selector's checkboxes send — not photograph ids. Filtering by
   * the photograph's own id instead of its set's id matched nothing, so a
   * hand-picked selection silently fell through to the whole shared library.
   */
  it('scopes to the hand-picked sets by their own id, not the photograph id', async () => {
    await repository.findCandidates([], 'user-1', undefined, ['set-1', 'set-2']);

    const where = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { id?: unknown; asset: { id?: unknown; groups?: unknown } };
    };

    expect(where.where.id).toBeUndefined();
    expect(where.where.asset.id).toEqual({ in: ['set-1', 'set-2'] });
  });

  it('lets a hand-picked selection override the group library', async () => {
    await repository.findCandidates([], 'user-1', 'group-1', ['set-1']);

    const where = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { asset: { id?: unknown; groups?: unknown } };
    };

    expect(where.where.asset.id).toEqual({ in: ['set-1'] });
    expect(where.where.asset.groups).toBeUndefined();
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

describe('scoping to an account', () => {
  it('shows an account its own sets and the legacy unowned ones', async () => {
    await repository.findAll('user-1');

    const args = prisma.brandAsset.findMany.mock.calls[0][0] as {
      where: { OR: unknown[] };
    };
    expect(args.where.OR).toEqual([{ userId: 'user-1' }, { userId: null }]);
  });

  it('stamps the owner on the set and on every photograph in it', async () => {
    await repository.create({
      userId: 'user-1',
      name: 'Summer',
      images: [{ url: 'https://cdn.test/a.jpg', reference: 'a' }],
    });

    const args = prisma.brandAsset.create.mock.calls[0][0] as {
      data: { userId: string; images: { create: Array<{ userId: string }> } };
    };
    expect(args.data.userId).toBe('user-1');
    expect(args.data.images.create[0].userId).toBe('user-1');
  });

  it('resolves a reference within the account, so two people may share a filename', async () => {
    await repository.findByReference('beach', 'user-1');

    const args = prisma.brandAssetImage.findUnique.mock.calls[0][0] as {
      where: { userId_reference: { userId: string; reference: string } };
    };
    expect(args.where.userId_reference).toEqual({ userId: 'user-1', reference: 'beach' });
  });

  it('will not return another account’s set by id', async () => {
    await repository.findOwned('asset-1', 'user-1');

    const args = prisma.brandAsset.findFirst.mock.calls[0][0] as {
      where: { id: string; userId: string };
    };
    expect(args.where).toEqual({ id: 'asset-1', userId: 'user-1' });
  });

  it('deletes a photograph only through the set its owner holds', async () => {
    await repository.removeOwnedImage('image-1', 'user-1');

    const args = prisma.brandAssetImage.deleteMany.mock.calls[0][0] as {
      where: { id: string; asset: { userId: string } };
    };
    expect(args.where).toEqual({ id: 'image-1', asset: { userId: 'user-1' } });
  });

  it('never draws a candidate photograph from outside the account', async () => {
    await repository.findCandidates([], 'user-1');

    const args = prisma.brandAssetImage.findMany.mock.calls[0][0] as {
      where: { asset: { OR: unknown[] } };
    };
    expect(args.where.asset.OR).toEqual([{ userId: 'user-1' }, { userId: null }]);
  });
});
