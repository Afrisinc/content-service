import { prisma } from '@/database/prismaClient';
import { Prisma, PrismaClient } from '@prisma/client';

export interface CreateBrandAssetImageInput {
  url: string;
  reference: string;
  subjects?: string[];
  hasPerson?: boolean;
  subjectSide?: string;
  brightness?: string;
}

export interface CreateBrandAssetInput {
  name: string;
  description?: string;
  kind?: string;
  approved?: boolean;
  images: CreateBrandAssetImageInput[];
}

const CANDIDATE_LIMIT = 25;
const SET_LIMIT = 100;

const withImages = {
  images: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.BrandAssetInclude;

export class BrandAssetRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  /** A set and its photographs, created together. */
  async create(data: CreateBrandAssetInput) {
    const { images, ...set } = data;

    return this.prisma.brandAsset.create({
      data: { ...set, images: { create: images } },
      include: withImages,
    });
  }

  async addImages(assetId: string, images: CreateBrandAssetImageInput[]) {
    await this.prisma.brandAssetImage.createMany({
      data: images.map(image => ({ ...image, assetId })),
      skipDuplicates: true,
    });
    return this.findById(assetId);
  }

  async removeImage(imageId: string) {
    return this.prisma.brandAssetImage.deleteMany({ where: { id: imageId } });
  }

  /**
   * Photographs available to draw from, least-recently-used first so the same
   * image does not carry three weeks of posts.
   *
   * A brand with sets of its own draws only from them; a brand with none falls
   * back to every approved set, so leaving it unassigned keeps the shared pool.
   */
  async findCandidates(subjects: string[], groupId?: string) {
    const where: Prisma.BrandAssetImageWhereInput = {
      ...(subjects.length ? { subjects: { hasSome: subjects } } : {}),
      asset: {
        kind: 'photo',
        approved: true,
        ...(groupId ? { groups: { some: { groupId } } } : {}),
      },
    };

    return this.prisma.brandAssetImage.findMany({
      where,
      orderBy: [{ lastUsedAt: { sort: 'asc', nulls: 'first' } }, { usageCount: 'asc' }],
      take: CANDIDATE_LIMIT,
    });
  }

  /** Whether a brand has sets of its own, or should use every approved one. */
  async countForGroup(groupId: string): Promise<number> {
    return this.prisma.brandAssetImage.count({
      where: { asset: { kind: 'photo', approved: true, groups: { some: { groupId } } } },
    });
  }

  /**
   * `client` matters here: assigning during group creation runs inside the
   * transaction that made the group, and the row is not visible to another
   * connection until that commits.
   */
  async assignToGroup(groupId: string, assetIds: string[], client?: Prisma.TransactionClient) {
    return (client ?? this.prisma).accountGroupAsset.createMany({
      data: assetIds.map(assetId => ({ groupId, assetId })),
      skipDuplicates: true,
    });
  }

  async unassignFromGroup(groupId: string, assetId: string) {
    return this.prisma.accountGroupAsset.deleteMany({ where: { groupId, assetId } });
  }

  async findByGroup(groupId: string) {
    return this.prisma.brandAsset.findMany({
      where: { groups: { some: { groupId } } },
      include: withImages,
      orderBy: { createdAt: 'desc' },
      take: SET_LIMIT,
    });
  }

  async findByReference(reference: string) {
    return this.prisma.brandAssetImage.findUnique({ where: { reference } });
  }

  async findManyByReference(references: string[]) {
    return this.prisma.brandAssetImage.findMany({
      where: { reference: { in: references } },
      take: references.length,
    });
  }

  /** Usage is recorded per photograph, since rotation is per photograph. */
  async recordUse(imageIds: string[]) {
    if (!imageIds.length) {
      return;
    }
    await this.prisma.brandAssetImage.updateMany({
      where: { id: { in: imageIds } },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
  }

  async findAll() {
    return this.prisma.brandAsset.findMany({
      include: withImages,
      orderBy: { createdAt: 'desc' },
      take: SET_LIMIT,
    });
  }

  async findById(id: string) {
    return this.prisma.brandAsset.findUnique({ where: { id }, include: withImages });
  }

  async approve(id: string, approved: boolean) {
    return this.prisma.brandAsset.update({
      where: { id },
      data: { approved },
      include: withImages,
    });
  }

  async update(id: string, data: { name?: string; description?: string | null }) {
    return this.prisma.brandAsset.update({ where: { id }, data, include: withImages });
  }

  async delete(id: string) {
    return this.prisma.brandAsset.delete({ where: { id } });
  }
}

export const brandAssetRepository = new BrandAssetRepository();
