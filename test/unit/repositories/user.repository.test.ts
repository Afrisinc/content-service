import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const findUnique = vi.fn();
const update = vi.fn();
const create = vi.fn();

vi.mock('@/database/prismaClient', () => ({
  prisma: { user: { findUnique, update, create } },
}));

vi.mock('@/utils/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { UserRepository } = await import('@/repositories/user.repository');

describe('ensureUser', () => {
  const repository = new UserRepository();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * The bug this pins: a user's email at the identity provider changed, but
   * ensureUser only ever patched `name` on an existing row, so the stored
   * email — and everything that reads it, like the post-approval email —
   * stayed frozen at whatever was captured on first login.
   */
  it('syncs the stored email when the token email has changed', async () => {
    findUnique.mockResolvedValueOnce({ id: 'user-1', email: 'old@example.com', name: 'Ada' });
    update.mockResolvedValueOnce({ id: 'user-1', email: 'new@example.com', name: 'Ada' });

    const result = await repository.ensureUser('user-1', 'new@example.com', 'Ada');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { email: 'new@example.com' },
    });
    expect(result.email).toBe('new@example.com');
  });

  it('does not touch the row when the token email matches what is stored', async () => {
    findUnique.mockResolvedValueOnce({ id: 'user-1', email: 'same@example.com', name: 'Ada' });

    const result = await repository.ensureUser('user-1', 'same@example.com', 'Ada');

    expect(update).not.toHaveBeenCalled();
    expect(result.email).toBe('same@example.com');
  });

  it('backfills a missing name alongside an email sync in a single update', async () => {
    findUnique.mockResolvedValueOnce({ id: 'user-1', email: 'old@example.com', name: null });
    update.mockResolvedValueOnce({ id: 'user-1', email: 'new@example.com', name: 'Ada' });

    await repository.ensureUser('user-1', 'new@example.com', 'Ada');

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { name: 'Ada', email: 'new@example.com' },
    });
  });

  it('keeps the existing row when the new email collides with another user', async () => {
    const existing = { id: 'user-1', email: 'old@example.com', name: 'Ada' };
    findUnique.mockResolvedValueOnce(existing);
    update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      })
    );

    const result = await repository.ensureUser('user-1', 'taken@example.com');

    expect(result).toBe(existing);
  });

  it('creates a new user when no row exists for the id or email', async () => {
    findUnique.mockResolvedValueOnce(null); // by id
    findUnique.mockResolvedValueOnce(null); // by email
    create.mockResolvedValueOnce({ id: 'user-2', email: 'brand-new@example.com', name: undefined });

    await repository.ensureUser('user-2', 'brand-new@example.com');

    expect(create).toHaveBeenCalledOnce();
  });
});
