import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/database/prismaClient', () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) =>
      fn({
        accountGroup: {
          create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
            id: 'group-1',
            ...data,
          })),
          delete: vi.fn(async () => ({ id: 'group-1' })),
        },
      })
    ),
  },
}));

const { AccountGroupService, slugifyGroupName, toAccountGroupDTO } =
  await import('@/services/accountGroup.service');
const { prisma } = await import('@/database/prismaClient');

function groupRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'group-1',
    userId: 'user-1',
    name: 'AFRISINC',
    slug: 'afrisinc',
    description: null,
    color: null,
    isDefault: true,
    isActive: true,
    autopilotEnabled: false,
    slotWeekdays: '2,5',
    slotHour: 9,
    timezone: 'UTC',
    postsPerRun: 1,
    topics: [],
    serviceLine: null,
    audience: null,
    defaultFormat: 'post',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-02T00:00:00.000Z'),
    members: [
      {
        accountId: 'acc-1',
        isActive: true,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        account: {
          platform: 'instagram',
          pageId: 'page-1',
          pageName: 'AFRISINC IG',
          pageAvatar: null,
          meta: null,
          isActive: true,
        },
      },
      {
        accountId: 'acc-2',
        isActive: false,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        account: {
          platform: 'facebook',
          pageId: 'page-2',
          pageName: 'AFRISINC FB',
          pageAvatar: null,
          meta: null,
          isActive: true,
        },
      },
    ],
    ...overrides,
  };
}

function build(overrides: Record<string, unknown> = {}) {
  const row = groupRow(overrides);

  const groups = {
    findAllByUser: vi.fn(async () => [row]),
    findByIdForUser: vi.fn(async () => row),
    findBySlug: vi.fn(async () => null),
    countByUser: vi.fn(async () => 0),
    create: vi.fn(async () => row),
    update: vi.fn(async () => row),
    delete: vi.fn(async () => row),
    clearDefaultForUser: vi.fn(async () => ({ count: 0 })),
    findDefaultForUser: vi.fn(async () => ({ id: 'group-1' })),
    addMembers: vi.fn(async () => ({ count: 1 })),
    removeMember: vi.fn(async () => ({ count: 1 })),
    setMemberActive: vi.fn(async () => ({ count: 1 })),
    findActiveTargets: vi.fn(async () => [
      { accountId: 'acc-1', platform: 'instagram', pageId: 'page-1', pageName: 'AFRISINC IG' },
    ]),
  };

  const accounts = {
    findAllByUser: vi.fn(async () => [{ id: 'acc-1' }, { id: 'acc-2' }]),
  };

  const policies = {
    findByUser: vi.fn(async () => null),
    clearDefaultGroup: vi.fn(async () => ({ count: 0 })),
  };

  const service = new AccountGroupService(groups as never, accounts as never, policies as never);
  return { service, groups, accounts, policies, row };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('slugifyGroupName', () => {
  it('lowercases, strips punctuation and collapses separators', () => {
    expect(slugifyGroupName('AFRISINC — Main Brand!')).toBe('afrisinc-main-brand');
  });

  it('falls back to a usable slug when the name has no letters', () => {
    expect(slugifyGroupName('!!!')).toBe('group');
  });
});

describe('toAccountGroupDTO', () => {
  it('counts only members that are switched on and still connected', () => {
    const dto = toAccountGroupDTO(groupRow() as never);

    expect(dto.activeMemberCount).toBe(1);
    expect(dto.members).toHaveLength(2);
    expect(dto.platforms).toEqual(['instagram', 'facebook']);
  });

  it('does not count a member whose underlying page was disconnected', () => {
    const row = groupRow();
    row.members[0].account.isActive = false;

    expect(toAccountGroupDTO(row as never).activeMemberCount).toBe(0);
  });
});

describe('create', () => {
  it('seeds the group with the accounts it was handed', async () => {
    const { service, groups } = build();

    await service.create('user-1', { name: 'AFRISINC', accountIds: ['acc-1', 'acc-2'] });

    expect(groups.addMembers).toHaveBeenCalledWith(
      'group-1',
      ['acc-1', 'acc-2'],
      expect.anything()
    );
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('makes the first group of a workspace the default', async () => {
    const { service, groups } = build();

    await service.create('user-1', { name: 'AFRISINC' });

    expect(groups.clearDefaultForUser).toHaveBeenCalledWith('user-1', 'group-1', expect.anything());
  });

  it('leaves a later group off the default unless asked', async () => {
    const { service, groups } = build();
    groups.countByUser.mockResolvedValueOnce(2 as never);

    await service.create('user-1', { name: 'Second brand' });

    expect(groups.clearDefaultForUser).not.toHaveBeenCalled();
  });

  it('refuses accounts installed under another login', async () => {
    const { service, groups } = build();

    await expect(
      service.create('user-1', { name: 'AFRISINC', accountIds: ['acc-9'] })
    ).rejects.toThrow(BadRequestError);

    expect(groups.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses to go past the per-workspace group cap', async () => {
    const { service, groups } = build();
    groups.countByUser.mockResolvedValueOnce(50 as never);

    await expect(service.create('user-1', { name: 'One too many' })).rejects.toThrow(ConflictError);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('disambiguates a slug that is already taken', async () => {
    const { service, groups } = build();
    groups.findBySlug.mockResolvedValueOnce({ id: 'other' } as never);

    await service.create('user-1', { name: 'AFRISINC' });

    expect(groups.findBySlug).toHaveBeenNthCalledWith(1, 'user-1', 'afrisinc');
    expect(groups.findBySlug).toHaveBeenNthCalledWith(2, 'user-1', 'afrisinc-2');
  });
});

describe('update', () => {
  it('reslugs only when the name actually changed', async () => {
    const { service, groups } = build();

    await service.update('user-1', 'group-1', { name: 'AFRISINC' });

    expect(groups.findBySlug).not.toHaveBeenCalled();
  });

  it('carries the cadence through to the repository', async () => {
    const { service, groups } = build();

    await service.update('user-1', 'group-1', {
      autopilotEnabled: true,
      slotWeekdays: '1,3',
      slotHour: 7,
      postsPerRun: 2,
    });

    expect(groups.update).toHaveBeenCalledWith(
      'group-1',
      expect.objectContaining({
        autopilotEnabled: true,
        slotWeekdays: '1,3',
        slotHour: 7,
        postsPerRun: 2,
      }),
      expect.anything()
    );
  });

  it('clears an emptied description rather than storing whitespace', async () => {
    const { service, groups } = build();

    await service.update('user-1', 'group-1', { description: '   ' });

    expect(groups.update).toHaveBeenCalledWith(
      'group-1',
      expect.objectContaining({ description: null }),
      expect.anything()
    );
  });

  it('404s on a group belonging to someone else', async () => {
    const { service, groups } = build();
    groups.findByIdForUser.mockResolvedValueOnce(null as never);

    await expect(service.update('user-1', 'group-1', { name: 'x' })).rejects.toThrow(NotFoundError);
    expect(groups.update).not.toHaveBeenCalled();
  });
});

describe('membership', () => {
  it('404s when switching an account that is not in the group', async () => {
    const { service, groups } = build();
    groups.setMemberActive.mockResolvedValueOnce({ count: 0 } as never);

    await expect(service.setAccountActive('user-1', 'group-1', 'acc-9', false)).rejects.toThrow(
      NotFoundError
    );
  });

  it('404s when removing an account that is not in the group', async () => {
    const { service, groups } = build();
    groups.removeMember.mockResolvedValueOnce({ count: 0 } as never);

    await expect(service.removeAccount('user-1', 'group-1', 'acc-9')).rejects.toThrow(
      NotFoundError
    );
  });

  it('refuses an empty add', async () => {
    const { service, groups } = build();

    await expect(service.addAccounts('user-1', 'group-1', [])).rejects.toThrow(BadRequestError);
    expect(groups.addMembers).not.toHaveBeenCalled();
  });

  it('de-duplicates repeated account ids', async () => {
    const { service, groups } = build();

    await service.addAccounts('user-1', 'group-1', ['acc-1', 'acc-1', 'acc-2']);

    expect(groups.addMembers).toHaveBeenCalledWith('group-1', ['acc-1', 'acc-2']);
  });
});

describe('remove', () => {
  it('drops the policy pointer before deleting the group it names', async () => {
    const { service, policies } = build();

    await service.remove('user-1', 'group-1');

    expect(policies.clearDefaultGroup).toHaveBeenCalledWith('group-1', expect.anything());
  });

  it('never deletes a group the caller does not own', async () => {
    const { service, groups, policies } = build();
    groups.findByIdForUser.mockResolvedValueOnce(null as never);

    await expect(service.remove('user-1', 'group-1')).rejects.toThrow(NotFoundError);
    expect(policies.clearDefaultGroup).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('resolveDefaultGroupId', () => {
  it('prefers the group named on the policy', async () => {
    const { service, policies } = build();
    policies.findByUser.mockResolvedValueOnce({ defaultGroupId: 'group-1' } as never);

    await expect(service.resolveDefaultGroupId('user-1')).resolves.toBe('group-1');
  });

  it('ignores a policy pointing at a group the caller no longer owns', async () => {
    const { service, groups, policies } = build();
    policies.findByUser.mockResolvedValueOnce({ defaultGroupId: 'gone' } as never);
    groups.findByIdForUser.mockResolvedValueOnce(null as never);

    await expect(service.resolveDefaultGroupId('user-1')).resolves.toBe('group-1');
    expect(groups.findDefaultForUser).toHaveBeenCalled();
  });

  it('returns null when the workspace has no groups at all', async () => {
    const { service, groups } = build();
    groups.findDefaultForUser.mockResolvedValueOnce(null as never);

    await expect(service.resolveDefaultGroupId('user-1')).resolves.toBeNull();
  });
});
