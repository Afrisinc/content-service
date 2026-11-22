import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  normaliseSubjects,
  uniqueReferences,
  updateBrandAsset,
  uploadBrandAssets,
  uploadImagesToAsset,
} from '@/controllers/brandAsset.controller';
import { BadRequestError, NotFoundError, UnauthorizedError } from '@/utils/http-error';
import type { FastifyReply, FastifyRequest } from 'fastify';

const repository = vi.hoisted(() => ({
  findOwned: vi.fn(),
  update: vi.fn(async () => ({ id: 'asset-1' })),
  create: vi.fn(async (data: unknown) => data),
  addImages: vi.fn(),
  replaceSubjects: vi.fn(async () => undefined),
  findReferencesStartingWith: vi.fn(async () => [] as string[]),
}));

const assets = vi.hoisted(() => ({
  uploadBuffer: vi.fn(async (_body: Buffer, filename: string) => ({
    url: `https://assets.example/${filename}`,
  })),
}));

vi.mock('@/repositories/brandAsset.repository', () => ({ brandAssetRepository: repository }));
vi.mock('@/utils/assets-client', () => ({ getAssetsClient: () => assets }));
vi.mock('@/config/env', () => ({ env: { BRAND_ASSET_MAX_BYTES: 1024 } }));

function fakeReply() {
  const reply = { status: vi.fn(() => reply), send: vi.fn(() => reply) };
  return reply as unknown as FastifyReply & { send: ReturnType<typeof vi.fn> };
}

const asUser = (userId: string, parts: Partial<FastifyRequest> = {}) =>
  ({ user: { userId }, params: {}, body: {}, ...parts }) as FastifyRequest;

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64');
const file = (filename: string, overrides: Record<string, string> = {}) => ({
  filename,
  contentType: 'image/png',
  content: png,
  ...overrides,
});

const image = (reference: string, subjects: string[] = ['office']) => ({
  id: reference,
  reference,
  subjects,
});

const sentData = (reply: ReturnType<typeof fakeReply>) => reply.send.mock.calls[0][0].data;

beforeEach(() => {
  vi.clearAllMocks();
  repository.findReferencesStartingWith.mockResolvedValue([]);
});

describe('uniqueReferences', () => {
  it('keeps a reference nobody has used', () => {
    expect(uniqueReferences(['office'], [])).toEqual(['office']);
  });

  it('numbers a clash with the library instead of dropping it', () => {
    expect(uniqueReferences(['office'], ['office', 'office-2'])).toEqual(['office-3']);
  });

  it('numbers clashes inside the same batch', () => {
    expect(uniqueReferences(['image', 'image', 'image'], [])).toEqual([
      'image',
      'image-2',
      'image-3',
    ]);
  });

  it('keeps a numbered reference inside the column limit', () => {
    const long = 'a'.repeat(60);

    const [reference] = uniqueReferences([long], [long]);

    expect(reference).toHaveLength(60);
    expect(reference.endsWith('-2')).toBe(true);
  });
});

describe('normaliseSubjects', () => {
  it('trims, lowercases and removes duplicates and blanks', () => {
    expect(normaliseSubjects([' Office ', 'office', '', 'Team  Work'])).toEqual([
      'office',
      'team work',
    ]);
  });
});

describe('uploadImagesToAsset', () => {
  const upload = (userId: string, body: Record<string, unknown>) =>
    uploadImagesToAsset(asUser(userId, { params: { id: 'asset-1' }, body }), fakeReply());

  it('refuses without a signed-in account', async () => {
    await expect(
      uploadImagesToAsset(
        { params: { id: 'asset-1' }, body: { files: [file('a.png')] } } as FastifyRequest,
        fakeReply()
      )
    ).rejects.toThrow(UnauthorizedError);
  });

  it('refuses another account’s set before uploading anything', async () => {
    repository.findOwned.mockResolvedValue(null);

    await expect(upload('user-2', { files: [file('a.png')] })).rejects.toThrow(NotFoundError);
    expect(assets.uploadBuffer).not.toHaveBeenCalled();
  });

  it('uploads into the set, carrying its subjects, and reports what was really added', async () => {
    repository.findOwned.mockResolvedValue({ id: 'asset-1', images: [image('desk')] });
    repository.findReferencesStartingWith.mockResolvedValue(['team']);
    repository.addImages.mockResolvedValue({
      id: 'asset-1',
      images: [image('desk'), image('team-2'), image('laptop')],
    });
    const reply = fakeReply();

    await uploadImagesToAsset(
      asUser('user-1', {
        params: { id: 'asset-1' },
        body: { files: [file('Team.png'), file('laptop.png')] },
      }),
      reply
    );

    expect(repository.addImages).toHaveBeenCalledWith('asset-1', 'user-1', [
      { url: 'https://assets.example/Team.png', reference: 'team-2', subjects: ['office'] },
      { url: 'https://assets.example/laptop.png', reference: 'laptop', subjects: ['office'] },
    ]);
    expect(sentData(reply)).toMatchObject({ added: 2, rejected: [] });
  });

  it('uses the subjects sent with the upload when there are any', async () => {
    repository.findOwned.mockResolvedValue({ id: 'asset-1', images: [image('desk')] });
    repository.addImages.mockResolvedValue({ id: 'asset-1', images: [] });

    await upload('user-1', { files: [file('a.png')], subjects: ['Launch', 'launch'] });

    expect(repository.addImages.mock.calls[0][2][0].subjects).toEqual(['launch']);
  });

  it('reports files it could not store and keeps the rest', async () => {
    repository.findOwned.mockResolvedValue({ id: 'asset-1', images: [] });
    repository.addImages.mockResolvedValue({ id: 'asset-1', images: [image('ok')] });
    const reply = fakeReply();

    await uploadImagesToAsset(
      asUser('user-1', {
        params: { id: 'asset-1' },
        body: { files: [file('ok.png'), file('notes.txt', { contentType: 'text/plain' })] },
      }),
      reply
    );

    expect(sentData(reply)).toMatchObject({ added: 1, rejected: ['notes.txt: not an image'] });
  });

  it('fails clearly when nothing could be stored', async () => {
    repository.findOwned.mockResolvedValue({ id: 'asset-1', images: [] });

    await expect(
      upload('user-1', { files: [file('big.png', { content: 'A'.repeat(4000) })] })
    ).rejects.toThrow(BadRequestError);
    expect(repository.addImages).not.toHaveBeenCalled();
  });
});

describe('uploadBrandAssets', () => {
  it('numbers two files with the same name instead of failing the new set', async () => {
    await uploadBrandAssets(
      asUser('user-1', { body: { files: [file('image.png'), file('image.png')] } }),
      fakeReply()
    );

    const created = repository.create.mock.calls[0][0] as {
      images: Array<{ reference: string }>;
    };
    expect(created.images.map(entry => entry.reference)).toEqual(['image', 'image-2']);
  });
});

describe('updateBrandAsset', () => {
  beforeEach(() => {
    repository.findOwned.mockResolvedValue({ id: 'asset-1', images: [] });
  });

  it('replaces the subjects of every photograph in the set, cleaned', async () => {
    await updateBrandAsset(
      asUser('user-1', { params: { id: 'asset-1' }, body: { subjects: ['Team', ' team '] } }),
      fakeReply()
    );

    expect(repository.replaceSubjects).toHaveBeenCalledWith('asset-1', ['team']);
  });

  it('leaves subjects alone when none are sent', async () => {
    await updateBrandAsset(
      asUser('user-1', { params: { id: 'asset-1' }, body: { name: 'Launch week' } }),
      fakeReply()
    );

    expect(repository.replaceSubjects).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith('asset-1', { name: 'Launch week' });
  });

  it('refuses a blank name', async () => {
    await expect(
      updateBrandAsset(
        asUser('user-1', { params: { id: 'asset-1' }, body: { name: '   ' } }),
        fakeReply()
      )
    ).rejects.toThrow(BadRequestError);
    expect(repository.update).not.toHaveBeenCalled();
  });
});
