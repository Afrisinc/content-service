import { beforeEach, describe, expect, it, vi } from 'vitest';

const findById = vi.hoisted(() => vi.fn());

vi.mock('@/repositories/user.repository', () => ({
  UserRepository: class {
    findById = findById;
  },
}));

const { adminGuard } = await import('@/middlewares/adminGuard');

function request(userId?: string, role?: string) {
  return { user: userId ? { userId, role } : undefined } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('adminGuard', () => {
  it('rejects an unauthenticated request without touching the database', async () => {
    await expect(adminGuard(request())).rejects.toThrow('Authentication required');
    expect(findById).not.toHaveBeenCalled();
  });

  it('rejects a user that no longer exists', async () => {
    findById.mockResolvedValue(null);

    await expect(adminGuard(request('user-1'))).rejects.toThrow('Administrator access required');
  });

  it('rejects a non-admin role', async () => {
    findById.mockResolvedValue({ role: 'editor', isActive: true });

    await expect(adminGuard(request('user-1'))).rejects.toThrow('Administrator access required');
  });

  it('rejects a deactivated admin', async () => {
    findById.mockResolvedValue({ role: 'admin', isActive: false });

    await expect(adminGuard(request('user-1'))).rejects.toThrow('Administrator access required');
  });

  it('lets an active user through when the token carries the SUPER_ADMIN role', async () => {
    findById.mockResolvedValue({ role: 'editor', isActive: true });

    await expect(adminGuard(request('user-1', 'SUPER_ADMIN'))).resolves.toBeUndefined();
  });

  it('rejects a token role that is not an admin role', async () => {
    findById.mockResolvedValue({ role: 'editor', isActive: true });

    await expect(adminGuard(request('user-1', 'OPS_MANAGER'))).rejects.toThrow(
      'Administrator access required'
    );
  });

  it('rejects a deactivated user even when the token says SUPER_ADMIN', async () => {
    findById.mockResolvedValue({ role: 'editor', isActive: false });

    await expect(adminGuard(request('user-1', 'SUPER_ADMIN'))).rejects.toThrow(
      'Administrator access required'
    );
  });

  it('lets an active admin through', async () => {
    findById.mockResolvedValue({ role: 'admin', isActive: true });

    await expect(adminGuard(request('admin-1'))).resolves.toBeUndefined();
    expect(findById).toHaveBeenCalledWith('admin-1');
  });
});
