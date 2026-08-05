import crypto from 'node:crypto';
import { prisma } from '../database/prismaClient';

export class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async ensureUser(id: string, email: string, name?: string) {
    const existingById = await prisma.user.findUnique({ where: { id } });
    if (existingById) {
      if (name && !existingById.name) {
        return prisma.user.update({ where: { id }, data: { name } });
      }
      return existingById;
    }

    const existingByEmail = await prisma.user.findUnique({ where: { email } });
    if (existingByEmail) {
      return prisma.user.update({
        where: { email },
        data: { id, name: existingByEmail.name ?? name },
      });
    }

    try {
      return await prisma.user.create({
        data: { id, email, name, password: crypto.randomBytes(32).toString('hex') },
      });
    } catch (error) {
      const raced = await prisma.user.findUnique({ where: { id } });
      if (raced) {
        return raced;
      }
      throw error;
    }
  }

  async findById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  }

  async findByIdWithAccounts(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: {
        socialAccounts: {
          select: {
            id: true,
            platform: true,
            pageId: true,
            pageName: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });
  }

  async create(data: any) {
    return prisma.user.create({ data });
  }
}
