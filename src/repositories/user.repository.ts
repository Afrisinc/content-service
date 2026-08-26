import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../database/prismaClient';
import { logger } from '@/utils/logger';

export class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  }

  async ensureUser(id: string, email: string, name?: string) {
    const existingById = await prisma.user.findUnique({ where: { id } });
    if (existingById) {
      const patch: Prisma.UserUpdateInput = {};
      if (name && !existingById.name) {
        patch.name = name;
      }
      if (email && email !== existingById.email) {
        patch.email = email;
      }

      if (Object.keys(patch).length === 0) {
        return existingById;
      }

      try {
        return await prisma.user.update({ where: { id }, data: patch });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          logger.warn(
            { userId: id, email },
            'Skipped email sync on ensureUser: email already in use by another user'
          );
          return existingById;
        }
        throw error;
      }
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

export const userRepository = new UserRepository();
