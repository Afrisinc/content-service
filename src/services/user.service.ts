import { prisma } from '../database/prismaClient';

export class UserService {
  async getUser(params: any) {
    const { id } = params;
    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async getUserProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  async updateUser(params: any, data: any) {
    const { id } = params;
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { name: data.name },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return updatedUser;
  }

  async updateUserProfile(userId: string, data: any) {
    const updateData: any = {};
    if (data.name) {
      updateData.name = data.name;
    }
    if (data.email) {
      updateData.email = data.email;
    }

    if (Object.keys(updateData).length === 0) {
      throw new Error('At least one field must be provided');
    }

    try {
      const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return updatedUser;
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new Error('User with this email already exists');
      }
      throw error;
    }
  }
}
