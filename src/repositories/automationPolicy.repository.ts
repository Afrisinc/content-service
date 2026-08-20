/**
 * Automation Policy Repository
 * Database operations for the per-user manual/autopilot switch
 */

import { prisma } from '@/database/prismaClient';
import { AutomationMode, Prisma, PrismaClient } from '@prisma/client';

export interface UpsertAutomationPolicyInput {
  mode?: AutomationMode;
  autoPublish?: boolean;
  defaultGroupId?: string | null;
  maxPostsPerDay?: number;
  pausedUntil?: Date | null;
}

export class AutomationPolicyRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async findByUser(userId: string) {
    return this.prisma.automationPolicy.findUnique({ where: { userId } });
  }

  async upsert(userId: string, data: UpsertAutomationPolicyInput) {
    return this.prisma.automationPolicy.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async touchLastRun(userId: string, at: Date = new Date()) {
    return this.prisma.automationPolicy.updateMany({
      where: { userId },
      data: { lastRunAt: at },
    });
  }

  /**
   * Users whose workspace is on autopilot and not paused. Anyone who never
   * touched the switch stays on manual, so absence of a row means no autopilot.
   */
  async findRunnableUserIds(now: Date = new Date(), limit = 200): Promise<string[]> {
    const rows = await this.prisma.automationPolicy.findMany({
      where: {
        mode: AutomationMode.autopilot,
        OR: [{ pausedUntil: null }, { pausedUntil: { lte: now } }],
      },
      select: { userId: true },
      take: limit,
    });
    return rows.map((row: { userId: string }) => row.userId);
  }

  /** Clears the pointer when the group it names is deleted. */
  async clearDefaultGroup(groupId: string, client?: Prisma.TransactionClient) {
    return (client ?? this.prisma).automationPolicy.updateMany({
      where: { defaultGroupId: groupId },
      data: { defaultGroupId: null },
    });
  }
}

export const automationPolicyRepository = new AutomationPolicyRepository();
