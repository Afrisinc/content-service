import { FastifyRequest } from 'fastify';
import { createError } from '@/middlewares/errorHandler';
import { UserRepository } from '@/repositories/user.repository';

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

const userRepository = new UserRepository();

function isAdminRole(role?: string | null): boolean {
  return Boolean(role) && ADMIN_ROLES.has((role as string).toLowerCase());
}

export const adminGuard = async (request: FastifyRequest) => {
  const userId = request.user?.userId;
  if (!userId) {
    throw createError.unauthorized('Authentication required');
  }

  const user = await userRepository.findById(userId);
  if (!user?.isActive || !(isAdminRole(request.user?.role) || isAdminRole(user.role))) {
    throw createError.forbidden('Administrator access required');
  }
};
