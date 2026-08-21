import { prisma } from '@/database/prismaClient';
import {
  AccountGroupRepository,
  accountGroupRepository,
  type AccountGroupWithMembers,
} from '@/repositories/accountGroup.repository';
import {
  AutomationPolicyRepository,
  automationPolicyRepository,
} from '@/repositories/automationPolicy.repository';
import {
  SocialMediaAccountRepository,
  socialMediaAccountRepository,
} from '@/repositories/socialMediaAccount.repository';
import {
  AccountGroupDTO,
  CreateAccountGroupPayload,
  GroupTarget,
  UpdateAccountGroupPayload,
} from '@/types/accountGroup.types';
import type { SocialPlatformKey } from '@/types/socialMediaIntegration.types';
import { BrandAssetRepository, brandAssetRepository } from '@/repositories/brandAsset.repository';
import { BadRequestError, ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { Prisma } from '@prisma/client';

const MAX_GROUPS_PER_USER = 50;
const SLUG_MAX_LENGTH = 60;

export function slugifyGroupName(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
  return slug || 'group';
}

export function toAccountGroupDTO(group: AccountGroupWithMembers): AccountGroupDTO {
  const members = group.members.map(member => ({
    accountId: member.accountId,
    isActive: member.isActive,
    platform: member.account.platform as SocialPlatformKey,
    pageId: member.account.pageId,
    pageName: member.account.pageName,
    pageAvatar: member.account.pageAvatar,
    meta: member.account.meta,
    accountIsActive: member.account.isActive,
    addedAt: member.createdAt.toISOString(),
  }));

  return {
    id: group.id,
    name: group.name,
    slug: group.slug,
    description: group.description,
    color: group.color,
    isDefault: group.isDefault,
    isActive: group.isActive,
    autopilotEnabled: group.autopilotEnabled,
    slotWeekdays: group.slotWeekdays,
    slotHour: group.slotHour,
    timezone: group.timezone,
    postsPerRun: group.postsPerRun,
    topics: group.topics,
    serviceLine: group.serviceLine,
    audience: group.audience,
    defaultFormat: group.defaultFormat,
    slideCount: group.slideCount,
    members,
    activeMemberCount: members.filter(member => member.isActive && member.accountIsActive).length,
    platforms: [...new Set(members.map(member => member.platform))],
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
  };
}

export class AccountGroupService {
  constructor(
    private readonly groups: AccountGroupRepository = accountGroupRepository,
    private readonly accounts: SocialMediaAccountRepository = socialMediaAccountRepository,
    private readonly policies: AutomationPolicyRepository = automationPolicyRepository,
    private readonly assets: BrandAssetRepository = brandAssetRepository
  ) {}

  async list(userId: string): Promise<AccountGroupDTO[]> {
    const groups = await this.groups.findAllByUser(userId);
    return groups.map(toAccountGroupDTO);
  }

  async get(userId: string, groupId: string): Promise<AccountGroupDTO> {
    return toAccountGroupDTO(await this.requireGroup(userId, groupId));
  }

  async create(userId: string, payload: CreateAccountGroupPayload): Promise<AccountGroupDTO> {
    const existingCount = await this.groups.countByUser(userId);
    if (existingCount >= MAX_GROUPS_PER_USER) {
      throw new ConflictError(`a workspace can hold at most ${MAX_GROUPS_PER_USER} groups`);
    }

    const accountIds = await this.assertOwnedAccounts(userId, payload.accountIds ?? []);
    const slug = await this.uniqueSlug(userId, payload.name);
    // The first group a user creates is the one everything targets by default.
    const isDefault = payload.isDefault ?? existingCount === 0;

    const group = await prisma.$transaction(async tx => {
      const created = await tx.accountGroup.create({
        data: {
          userId,
          slug,
          name: payload.name.trim(),
          description: payload.description?.trim(),
          color: payload.color,
          isDefault,
          topics: payload.topics ?? [],
          serviceLine: payload.serviceLine?.trim(),
          audience: payload.audience?.trim(),
          ...this.cadenceFrom(payload),
        },
      });

      if (accountIds.length) {
        await this.groups.addMembers(created.id, accountIds, tx);
      }
      // A brand with no photographs of its own falls back to the shared pool,
      // so leaving this empty is a real choice rather than an unfinished one.
      if (payload.assetIds?.length) {
        await this.assets.assignToGroup(created.id, payload.assetIds, tx);
      }
      if (isDefault) {
        await this.groups.clearDefaultForUser(userId, created.id, tx);
      }

      return created;
    });

    logger.info(
      { userId, groupId: group.id, accounts: accountIds.length },
      'Account group created'
    );
    return toAccountGroupDTO(await this.requireGroup(userId, group.id));
  }

  async update(
    userId: string,
    groupId: string,
    payload: UpdateAccountGroupPayload
  ): Promise<AccountGroupDTO> {
    const group = await this.requireGroup(userId, groupId);

    const data: Prisma.AccountGroupUpdateInput = {
      ...(payload.name !== undefined ? { name: payload.name.trim() } : {}),
      ...(payload.description !== undefined
        ? { description: payload.description.trim() || null }
        : {}),
      ...(payload.color !== undefined ? { color: payload.color } : {}),
      ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
      ...(payload.isDefault !== undefined ? { isDefault: payload.isDefault } : {}),
      ...(payload.topics !== undefined ? { topics: payload.topics } : {}),
      ...(payload.serviceLine !== undefined
        ? { serviceLine: payload.serviceLine.trim() || null }
        : {}),
      ...(payload.audience !== undefined ? { audience: payload.audience.trim() || null } : {}),
      ...this.cadenceFrom(payload),
    };

    if (payload.name && payload.name.trim() !== group.name) {
      data.slug = await this.uniqueSlug(userId, payload.name);
    }

    const updated = await prisma.$transaction(async tx => {
      const next = await this.groups.update(groupId, data, tx);
      if (payload.isDefault) {
        await this.groups.clearDefaultForUser(userId, groupId, tx);
      }
      return next;
    });

    return toAccountGroupDTO(updated);
  }

  /** The photographs a brand draws from, and whether it has a library at all. */
  async listAssets(userId: string, groupId: string) {
    await this.requireGroup(userId, groupId);
    return this.assets.findByGroup(groupId);
  }

  async assignAssets(userId: string, groupId: string, assetIds: string[]) {
    await this.requireGroup(userId, groupId);

    if (!assetIds.length) {
      throw new BadRequestError('no photographs to assign');
    }

    await this.assets.assignToGroup(groupId, assetIds);
    return this.assets.findByGroup(groupId);
  }

  async unassignAsset(userId: string, groupId: string, assetId: string) {
    await this.requireGroup(userId, groupId);

    const removed = await this.assets.unassignFromGroup(groupId, assetId);
    if (removed.count === 0) {
      throw new NotFoundError('that photograph is not in this brand');
    }

    return this.assets.findByGroup(groupId);
  }

  async remove(userId: string, groupId: string): Promise<void> {
    await this.requireGroup(userId, groupId);

    await prisma.$transaction(async tx => {
      await this.policies.clearDefaultGroup(groupId, tx);
      await tx.accountGroup.delete({ where: { id: groupId } });
    });

    logger.info({ userId, groupId }, 'Account group deleted');
  }

  async addAccounts(
    userId: string,
    groupId: string,
    accountIds: string[]
  ): Promise<AccountGroupDTO> {
    await this.requireGroup(userId, groupId);
    const owned = await this.assertOwnedAccounts(userId, accountIds);

    if (!owned.length) {
      throw new BadRequestError('no accounts to add');
    }

    await this.groups.addMembers(groupId, owned);
    return toAccountGroupDTO(await this.requireGroup(userId, groupId));
  }

  async removeAccount(
    userId: string,
    groupId: string,
    accountId: string
  ): Promise<AccountGroupDTO> {
    await this.requireGroup(userId, groupId);

    const removed = await this.groups.removeMember(groupId, accountId);
    if (removed.count === 0) {
      throw new NotFoundError('that account is not in this group');
    }

    return toAccountGroupDTO(await this.requireGroup(userId, groupId));
  }

  /** Switch one page on or off inside a group without dropping it from the group. */
  async setAccountActive(
    userId: string,
    groupId: string,
    accountId: string,
    isActive: boolean
  ): Promise<AccountGroupDTO> {
    await this.requireGroup(userId, groupId);

    const updated = await this.groups.setMemberActive(groupId, accountId, isActive);
    if (updated.count === 0) {
      throw new NotFoundError('that account is not in this group');
    }

    return toAccountGroupDTO(await this.requireGroup(userId, groupId));
  }

  /**
   * Where a group publishes. Empty means the group has pages but every one of
   * them is muted or disconnected — the caller must not silently post nowhere.
   */
  async resolveTargets(userId: string, groupId: string): Promise<GroupTarget[]> {
    await this.requireGroup(userId, groupId);
    return this.groups.findActiveTargets(groupId);
  }

  /** The group a brief lands on when the caller names none. */
  async resolveDefaultGroupId(userId: string): Promise<string | null> {
    const policy = await this.policies.findByUser(userId);
    if (policy?.defaultGroupId) {
      const owned = await this.groups.findByIdForUser(policy.defaultGroupId, userId);
      if (owned) {
        return owned.id;
      }
    }

    const fallback = await this.groups.findDefaultForUser(userId);
    return fallback?.id ?? null;
  }

  private cadenceFrom(payload: UpdateAccountGroupPayload) {
    return {
      ...(payload.autopilotEnabled !== undefined
        ? { autopilotEnabled: payload.autopilotEnabled }
        : {}),
      ...(payload.slotWeekdays !== undefined ? { slotWeekdays: payload.slotWeekdays } : {}),
      ...(payload.slotHour !== undefined ? { slotHour: payload.slotHour } : {}),
      ...(payload.timezone !== undefined ? { timezone: payload.timezone } : {}),
      ...(payload.postsPerRun !== undefined ? { postsPerRun: payload.postsPerRun } : {}),
      ...(payload.defaultFormat !== undefined ? { defaultFormat: payload.defaultFormat } : {}),
      ...(payload.slideCount !== undefined ? { slideCount: payload.slideCount } : {}),
    };
  }

  /** Two brands may share a name; their slugs may not. */
  private async uniqueSlug(userId: string, name: string): Promise<string> {
    const base = slugifyGroupName(name);

    for (let suffix = 0; suffix < MAX_GROUPS_PER_USER + 1; suffix += 1) {
      const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`;
      const taken = await this.groups.findBySlug(userId, candidate);
      if (!taken) {
        return candidate;
      }
    }

    throw new ConflictError('could not derive a unique slug for that group name');
  }

  private async requireGroup(userId: string, groupId: string): Promise<AccountGroupWithMembers> {
    const group = await this.groups.findByIdForUser(groupId, userId);
    if (!group) {
      throw new NotFoundError('account group not found');
    }
    return group;
  }

  /** A caller may only group pages their own login installed. */
  private async assertOwnedAccounts(userId: string, accountIds: string[]): Promise<string[]> {
    const unique = [...new Set(accountIds)];
    if (!unique.length) {
      return [];
    }

    const owned = await this.accounts.findAllByUser(userId);
    const ownedIds = new Set(owned.map(account => account.id));
    const foreign = unique.filter(id => !ownedIds.has(id));

    if (foreign.length) {
      throw new BadRequestError('one or more accounts are not installed under this login');
    }

    return unique;
  }
}

export const accountGroupService = new AccountGroupService();
