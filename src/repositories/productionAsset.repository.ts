import { prisma } from '@/database/prismaClient';
import {
  AudioTrackKind,
  Prisma,
  PrismaClient,
  StudioAssetKind,
  StudioJobStatus,
} from '@prisma/client';

export class ProductionAssetRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  async upsertCharacter(
    productionId: string,
    slug: string,
    name: string,
    spec: Prisma.InputJsonValue
  ) {
    const character = await this.prisma.studioCharacter.upsert({
      where: { productionId_slug: { productionId, slug } },
      create: { productionId, slug, name },
      update: { name },
    });

    const latest = await this.prisma.studioCharacterVersion.findFirst({
      where: { characterId: character.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const created = await this.prisma.studioCharacterVersion.create({
      data: { characterId: character.id, version, spec },
    });

    await this.prisma.studioCharacter.update({
      where: { id: character.id },
      data: { activeVersion: version },
    });

    return { character, version: created };
  }

  async attachCharacterAssets(
    versionId: string,
    assetKeys: string[],
    generator?: Prisma.InputJsonValue
  ) {
    return this.prisma.studioCharacterVersion.update({
      where: { id: versionId },
      data: { assetKeys, generator, status: 'ready' },
    });
  }

  async upsertEnvironment(
    productionId: string,
    slug: string,
    name: string,
    spec: Prisma.InputJsonValue
  ) {
    const environment = await this.prisma.studioEnvironment.upsert({
      where: { productionId_slug: { productionId, slug } },
      create: { productionId, slug, name },
      update: { name },
    });

    const latest = await this.prisma.studioEnvironmentVersion.findFirst({
      where: { environmentId: environment.id },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    const created = await this.prisma.studioEnvironmentVersion.create({
      data: { environmentId: environment.id, version, spec },
    });

    await this.prisma.studioEnvironment.update({
      where: { id: environment.id },
      data: { activeVersion: version },
    });

    return { environment, version: created };
  }

  async attachEnvironmentAssets(
    versionId: string,
    assetKeys: string[],
    generator?: Prisma.InputJsonValue
  ) {
    return this.prisma.studioEnvironmentVersion.update({
      where: { id: versionId },
      data: { assetKeys, generator, status: 'ready' },
    });
  }

  async upsertProp(productionId: string, slug: string, name: string, spec: Prisma.InputJsonValue) {
    return this.prisma.studioProp.upsert({
      where: { productionId_slug: { productionId, slug } },
      create: { productionId, slug, name, spec },
      update: { name, spec, version: { increment: 1 } },
    });
  }

  async findAssetByChecksum(checksum: string, kind: StudioAssetKind) {
    return this.prisma.studioAsset.findUnique({ where: { checksum_kind: { checksum, kind } } });
  }

  async createAsset(data: Prisma.StudioAssetUncheckedCreateInput) {
    return this.prisma.studioAsset.create({ data });
  }

  async recordAssetUse(assetId: string, productionId: string) {
    return this.prisma.studioAsset.update({
      where: { id: assetId },
      data: { productionId },
    });
  }

  async charactersFor(productionId: string) {
    return this.prisma.studioCharacter.findMany({
      where: { productionId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }

  async environmentsFor(productionId: string) {
    return this.prisma.studioEnvironment.findMany({
      where: { productionId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
  }

  async createAudioTrack(data: Prisma.StudioAudioTrackUncheckedCreateInput) {
    return this.prisma.studioAudioTrack.create({ data });
  }

  async updateAudioTrack(id: string, data: Prisma.StudioAudioTrackUncheckedUpdateInput) {
    return this.prisma.studioAudioTrack.update({ where: { id }, data });
  }

  async audioTracks(productionId: string, kind?: AudioTrackKind) {
    return this.prisma.studioAudioTrack.findMany({
      where: { productionId, ...(kind ? { kind } : {}) },
      orderBy: { createdAt: 'asc' },
    });
  }

  async markAudioTrackStatus(id: string, status: StudioJobStatus) {
    return this.prisma.studioAudioTrack.update({ where: { id }, data: { status } });
  }
}

export const productionAssetRepository = new ProductionAssetRepository();
