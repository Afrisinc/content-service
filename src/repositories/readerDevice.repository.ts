import { prisma } from '@/database/prismaClient';
import { PrismaClient } from '@prisma/client';

export class ReaderDeviceRepository {
  private readonly prisma: PrismaClient;

  constructor(client: PrismaClient = prisma) {
    this.prisma = client;
  }

  /** Creates the device on first sight; just bumps `lastSeenAt` after that. */
  async touch(deviceId: string): Promise<void> {
    await this.prisma.readerDevice.upsert({
      where: { id: deviceId },
      create: { id: deviceId },
      update: {},
    });
  }
}

export const readerDeviceRepository = new ReaderDeviceRepository();
