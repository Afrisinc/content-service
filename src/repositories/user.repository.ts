import { prisma } from '../database/prismaClient';

export class UserRepository {
  async findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
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
            pageeName: true,
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
