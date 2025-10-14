import { FastifyRequest, FastifyReply } from 'fastify';
import { UserService } from '../services/user.service';
import { success, error } from '../utils/response';

const service = new UserService();

export async function getUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await service.getUser(req.params);
    return success(reply, 200, 'User retrieved successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}

export async function getUserProfile(req: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return error(reply, 401, 'Unauthorized');
    }
    const result = await service.getUserProfile(userId);
    return success(reply, 200, 'Profile retrieved successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}

export async function updateUser(req: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await service.updateUser(req.params, req.body);
    return success(reply, 200, 'User updated successfully', result);
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}

export async function updateUserProfile(
  req: FastifyRequest,
  reply: FastifyReply
) {
  try {
    const userId = (req as any).user?.id;
    if (!userId) {
      return error(reply, 401, 'Unauthorized');
    }
    const result = await service.updateUserProfile(userId, req.body);
    return success(reply, 200, 'Profile updated successfully', {
      user: result,
    });
  } catch (err: any) {
    return error(reply, 400, err.message);
  }
}
