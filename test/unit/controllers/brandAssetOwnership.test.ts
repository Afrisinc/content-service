import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  approveBrandAsset,
  deleteBrandAsset,
  listBrandAssets,
  removeImageFromAsset,
  updateBrandAsset,
} from '@/controllers/brandAsset.controller';
import { NotFoundError, UnauthorizedError } from '@/utils/http-error';
import type { FastifyReply, FastifyRequest } from 'fastify';

const repository = vi.hoisted(() => ({
  findAll: vi.fn(async () => []),
  findById: vi.fn(async () => null),
  findOwned: vi.fn(async () => null),
  approve: vi.fn(async () => ({})),
  update: vi.fn(async () => ({})),
  delete: vi.fn(async () => ({})),
  removeOwnedImage: vi.fn(async () => ({ count: 0 })),
}));

vi.mock('@/repositories/brandAsset.repository', () => ({
  brandAssetRepository: repository,
}));

function fakeReply() {
  const reply = { status: vi.fn(() => reply), send: vi.fn(() => reply) };
  return reply as unknown as FastifyReply & { send: ReturnType<typeof vi.fn> };
}

const request = (parts: Partial<FastifyRequest>) => parts as FastifyRequest;
const asUser = (userId: string, parts: Partial<FastifyRequest> = {}) =>
  request({ user: { userId }, params: {}, body: {}, ...parts } as Partial<FastifyRequest>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authentication', () => {
  it.each([
    ['list', listBrandAssets],
    ['approve', approveBrandAsset],
    ['update', updateBrandAsset],
    ['delete', deleteBrandAsset],
    ['remove image', removeImageFromAsset],
  ])('refuses %s without a signed-in account', async (_name, handler) => {
    await expect(
      handler(request({ params: {}, body: {} } as Partial<FastifyRequest>), fakeReply())
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe('reading the library', () => {
  it('asks only for what this account can see', async () => {
    await listBrandAssets(asUser('user-1'), fakeReply());

    expect(repository.findAll).toHaveBeenCalledWith('user-1');
  });
});

describe('another account’s set', () => {
  const otherUsersAsset = { id: 'asset-1' };

  it('cannot be approved', async () => {
    await expect(
      approveBrandAsset(
        asUser('user-2', { params: { id: 'asset-1' }, body: { approved: true } }),
        fakeReply()
      )
    ).rejects.toThrow(NotFoundError);

    expect(repository.approve).not.toHaveBeenCalled();
  });

  it('cannot be renamed', async () => {
    await expect(
      updateBrandAsset(
        asUser('user-2', { params: { id: 'asset-1' }, body: { name: 'mine now' } }),
        fakeReply()
      )
    ).rejects.toThrow(NotFoundError);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('cannot be deleted', async () => {
    await expect(
      deleteBrandAsset(asUser('user-2', { params: { id: 'asset-1' } }), fakeReply())
    ).rejects.toThrow(NotFoundError);

    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('answers 404 rather than 403, so its existence is not disclosed', async () => {
    repository.findOwned.mockResolvedValueOnce(null as never);

    await expect(
      deleteBrandAsset(asUser('user-2', { params: { id: 'asset-1' } }), fakeReply())
    ).rejects.toThrow('asset not found');
  });

  it('checks ownership, not mere visibility', async () => {
    repository.findById.mockResolvedValue(otherUsersAsset as never);
    repository.findOwned.mockResolvedValue(null as never);

    await expect(
      deleteBrandAsset(asUser('user-2', { params: { id: 'asset-1' } }), fakeReply())
    ).rejects.toThrow(NotFoundError);
  });
});

describe('an account’s own set', () => {
  beforeEach(() => {
    repository.findOwned.mockResolvedValue({ id: 'asset-1' } as never);
  });

  it('can be approved', async () => {
    await approveBrandAsset(
      asUser('user-1', { params: { id: 'asset-1' }, body: { approved: true } }),
      fakeReply()
    );

    expect(repository.findOwned).toHaveBeenCalledWith('asset-1', 'user-1');
    expect(repository.approve).toHaveBeenCalledWith('asset-1', true);
  });

  it('can be renamed', async () => {
    await updateBrandAsset(
      asUser('user-1', { params: { id: 'asset-1' }, body: { name: 'Summer set' } }),
      fakeReply()
    );

    expect(repository.update).toHaveBeenCalledWith('asset-1', { name: 'Summer set' });
  });

  it('can be deleted', async () => {
    await deleteBrandAsset(asUser('user-1', { params: { id: 'asset-1' } }), fakeReply());

    expect(repository.delete).toHaveBeenCalledWith('asset-1');
  });
});

describe('removing one photograph', () => {
  it('scopes the delete to the caller rather than trusting the id', async () => {
    repository.removeOwnedImage.mockResolvedValueOnce({ count: 1 } as never);

    await removeImageFromAsset(
      asUser('user-1', { params: { id: 'asset-1', imageId: 'image-9' } }),
      fakeReply()
    );

    expect(repository.removeOwnedImage).toHaveBeenCalledWith('image-9', 'user-1');
  });

  it('reports not-found when the photograph belongs to someone else', async () => {
    repository.removeOwnedImage.mockResolvedValueOnce({ count: 0 } as never);

    await expect(
      removeImageFromAsset(
        asUser('user-2', { params: { id: 'asset-1', imageId: 'image-9' } }),
        fakeReply()
      )
    ).rejects.toThrow(NotFoundError);
  });
});
