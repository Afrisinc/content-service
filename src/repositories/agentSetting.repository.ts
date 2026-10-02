import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '@/database/prismaClient';
import type { AgentKey } from '@/config/agentRegistry';

export class AgentSettingRepository {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  async findByKey(agentKey: AgentKey) {
    return this.prisma.agentSetting.findUnique({ where: { agentKey } });
  }

  async save(agentKey: AgentKey, settings: Prisma.InputJsonObject, updatedBy: string) {
    return this.prisma.agentSetting.upsert({
      where: { agentKey },
      create: { agentKey, settings, updatedBy },
      update: { settings, updatedBy },
    });
  }
}

export const agentSettingRepository = new AgentSettingRepository();
