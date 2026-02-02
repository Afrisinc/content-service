/**
 * N8N Generated Post Repository
 * Handles database operations for N8N generated posts
 */

import { prisma } from '@/database/prismaClient';
import { calculateOffset } from '@/utils/pagination';
import { Prisma } from '@prisma/client';

export class N8nGeneratedPostRepository {
  /**
   * Find all generated posts with pagination
   */
  async findAll(page: number = 1, limit: number = 10) {
    const offset = calculateOffset(page, limit);
    const where: Prisma.N8nGeneratedPostWhereInput = {};

    const [posts, total] = await Promise.all([
      prisma.n8nGeneratedPost.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.n8nGeneratedPost.count({ where }),
    ]);

    return { posts, total };
  }

  /**
   * Find generated posts by status with pagination
   */
  async findByStatus(status: string, page: number = 1, limit: number = 10) {
    const offset = calculateOffset(page, limit);

    const [posts, total] = await Promise.all([
      prisma.n8nGeneratedPost.findMany({
        where: {
          status: {
            equals: status,
            mode: 'insensitive',
          },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.n8nGeneratedPost.count({
        where: {
          status: {
            equals: status,
            mode: 'insensitive',
          },
        },
      }),
    ]);

    return { posts, total };
  }

  /**
   * Find generated post by ID
   */
  async findById(id: bigint) {
    return prisma.n8nGeneratedPost.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new generated post
   */
  async create(data: Prisma.N8nGeneratedPostCreateInput) {
    return prisma.n8nGeneratedPost.create({
      data,
    });
  }

  /**
   * Update a generated post
   */
  async update(id: bigint, data: Prisma.N8nGeneratedPostUpdateInput) {
    return prisma.n8nGeneratedPost.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a generated post
   */
  async delete(id: bigint) {
    return prisma.n8nGeneratedPost.delete({
      where: { id },
    });
  }

  /**
   * Find posts by platform with pagination
   */
  async findByPlatform(platform: string, page: number = 1, limit: number = 10) {
    const offset = calculateOffset(page, limit);

    const [posts, total] = await Promise.all([
      prisma.n8nGeneratedPost.findMany({
        where: {
          platform: {
            equals: platform,
            mode: 'insensitive',
          },
        },
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
      }),
      prisma.n8nGeneratedPost.count({
        where: {
          platform: {
            equals: platform,
            mode: 'insensitive',
          },
        },
      }),
    ]);

    return { posts, total };
  }
}

export const n8nGeneratedPostRepository = new N8nGeneratedPostRepository();
