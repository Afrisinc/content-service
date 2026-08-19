import { prisma } from '@/database/prismaClient';
import { Prisma, PrismaClient } from '@prisma/client';

export interface CreateBrandAssetInput {
  url: string;
  reference: string;
  kind?: string;
  subjects?: string[];
  hasPerson?: boolean;
  subjectSide?: string;
  brightness?: string;
  approved?: boolean;
}

const CANDIDATE_LIMIT = 25;

export class BrandAssetRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async create(data: CreateBrandAssetInput) {
    return this.prisma.brandAsset.create({ data });
  }

  /**
   * Least-recently-used first so the same photograph does not carry three weeks
   * of posts — repetition is the fastest way for a feed to look automated.
   */
  async findCandidates(subjects: string[]) {
    const where: Prisma.BrandAssetWhereInput = {
      kind: 'photo',
      approved: true,
      ...(subjects.length ? { subjects: { hasSome: subjects } } : {}),
    };

    return this.prisma.brandAsset.findMany({
      where,
      orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { usageCount: 'asc' }],
      take: CANDIDATE_LIMIT,
    });
  }

  async findByReference(reference: string) {
    return this.prisma.brandAsset.findUnique({ where: { reference } });
  }

  async recordUse(ids: string[]) {
    if (!ids.length) {
      return;
    }
    await this.prisma.brandAsset.updateMany({
      where: { id: { in: ids } },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  async findAll() {
    return this.prisma.brandAsset.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.brandAsset.findUnique({ where: { id } });
  }

  async approve(id: string, approved: boolean) {
    return this.prisma.brandAsset.update({
      where: { id },
      data: { approved },
    });
  }

  async delete(id: string) {
    return this.prisma.brandAsset.delete({ where: { id } });
  }
}

export const brandAssetRepository = new BrandAssetRepository();
