/**
 * Account Group Repository
 * Database operations for brand groups and the accounts installed in them
 */

import { prisma } from '@/database/prismaClient';
import { Prisma, PrismaClient } from '@prisma/client';

const MAX_PAGE_SIZE = 100;

const withMembers = {
  members: {
    orderBy: { createdAt: 'asc' },
    include: { account: true },
  },
} satisfies Prisma.AccountGroupInclude;

export type AccountGroupWithMembers = Prisma.AccountGroupGetPayload<{
  include: typeof withMembers;
}>;

export interface CreateAccountGroupInput {
  userId: string;
  name: string;
  slug: string;
  description?: string;
  color?: string;
  isDefault?: boolean;
  topics?: string[];
  serviceLine?: string;
  audience?: string;
  defaultFormat?: string;
  autopilotEnabled?: boolean;
  slotWeekdays?: string;
  slotHour?: number;
  timezone?: string;
  postsPerRun?: number;
}

export class AccountGroupRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async create(data: CreateAccountGroupInput): Promise<AccountGroupWithMembers> {
    return this.prisma.accountGroup.create({ data, include: withMembers });
  }

  async findAllByUser(userId: string): Promise<AccountGroupWithMembers[]> {
    return this.prisma.accountGroup.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: withMembers,
      take: MAX_PAGE_SIZE,
    });
  }

  async findByIdForUser(id: string, userId: string): Promise<AccountGroupWithMembers | null> {
    return this.prisma.accountGroup.findFirst({
      where: { id, userId },
      include: withMembers,
    });
  }

  async findBySlug(userId: string, slug: string) {
    return this.prisma.accountGroup.findUnique({
      where: { userId_slug: { userId, slug } },
      select: { id: true },
    });
  }

  async update(
    id: string,
    data: Prisma.AccountGroupUpdateInput,
    client?: Prisma.TransactionClient
  ): Promise<AccountGroupWithMembers> {
    return (client ?? this.prisma).accountGroup.update({
      where: { id },
      data,
      include: withMembers,
    });
  }

  async delete(id: string) {
    return this.prisma.accountGroup.delete({ where: { id } });
  }

  /** Only one group per user carries the default flag. */
  async clearDefaultForUser(userId: string, exceptId: string, client?: Prisma.TransactionClient) {
    return (client ?? this.prisma).accountGroup.updateMany({
      where: { userId, isDefault: true, id: { not: exceptId } },
      data: { isDefault: false },
    });
  }

  async findDefaultForUser(userId: string) {
    return this.prisma.accountGroup.findFirst({
      where: { userId, isDefault: true, isActive: true },
      select: { id: true },
    });
  }

  async countByUser(userId: string): Promise<number> {
    return this.prisma.accountGroup.count({ where: { userId } });
  }

  async addMembers(groupId: string, accountIds: string[], client?: Prisma.TransactionClient) {
    return (client ?? this.prisma).accountGroupMember.createMany({
      data: accountIds.map(accountId => ({ groupId, accountId })),
      skipDuplicates: true,
    });
  }

  async removeMember(groupId: string, accountId: string) {
    return this.prisma.accountGroupMember.deleteMany({ where: { groupId, accountId } });
  }

  async setMemberActive(groupId: string, accountId: string, isActive: boolean) {
    return this.prisma.accountGroupMember.updateMany({
      where: { groupId, accountId },
      data: { isActive },
    });
  }

  async findMember(groupId: string, accountId: string) {
    return this.prisma.accountGroupMember.findUnique({
      where: { groupId_accountId: { groupId, accountId } },
    });
  }

  /**
   * The publishable destinations of a group: members switched on, whose
   * underlying page is still connected and holds a token.
   */
  async findActiveTargets(groupId: string) {
    const members = await this.prisma.accountGroupMember.findMany({
      where: { groupId, isActive: true, account: { isActive: true } },
      include: { account: true },
      orderBy: { createdAt: 'asc' },
      take: MAX_PAGE_SIZE,
    });

    return members.map(member => ({
      accountId: member.accountId,
      platform: member.account.platform,
      pageId: member.account.pageId,
      pageName: member.account.pageName,
    }));
  }

  /** The posting cadence of a group, for slot resolution. */
  async findCadence(groupId: string) {
    return this.prisma.accountGroup.findUnique({
      where: { id: groupId },
      select: { slotWeekdays: true, slotHour: true, postsPerRun: true, timezone: true },
    });
  }

  /** Groups the autopilot cron should consider on this tick. */
  async findAutopilotGroups(userIds: string[]): Promise<AccountGroupWithMembers[]> {
    return this.prisma.accountGroup.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
        autopilotEnabled: true,
        members: { some: { isActive: true, account: { isActive: true } } },
      },
      include: withMembers,
      orderBy: { createdAt: 'asc' },
      take: MAX_PAGE_SIZE,
    });
  }

  async countActiveAccountsForUser(userId: string): Promise<number> {
    return this.prisma.accountGroupMember.count({
      where: { isActive: true, group: { userId, isActive: true }, account: { isActive: true } },
    });
  }

  async countAutopilotGroupsForUser(userId: string): Promise<number> {
    return this.prisma.accountGroup.count({
      where: { userId, isActive: true, autopilotEnabled: true },
    });
  }

  /** Which groups a given page already sits in, so the UI can show its badges. */
  async findGroupIdsByAccountIds(accountIds: string[]) {
    return this.prisma.accountGroupMember.findMany({
      where: { accountId: { in: accountIds } },
      select: { accountId: true, groupId: true, isActive: true },
      take: MAX_PAGE_SIZE * 10,
    });
  }
}

export const accountGroupRepository = new AccountGroupRepository();
