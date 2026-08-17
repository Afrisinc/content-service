import { Prisma } from '@prisma/client';
import { logger } from '../../../auth-service/src/utils/logger';

export type CleanApiError = {
  status: number;
  code: number;
  message: string;
  details?: Record<string, unknown>;
};

export function mapPrismaError(err: unknown): CleanApiError | null {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        return {
          status: 409,
          code: 170,
          message: 'Unique constraint failed: Resource already exists.',
        };

      case 'P2003':
        return {
          status: 400,
          code: 171,
          message: 'Foreign key constraint failed: Invalid relation reference.',
        };

      case 'P2000':
        return {
          status: 400,
          code: 172,
          message: 'Invalid value length.',
        };

      case 'P2025':
        return {
          status: 404,
          code: 173,
          message: 'Resource not found.',
        };

      case 'P2028':
        return {
          status: 400,
          code: 174,
          message: 'Invalid transaction or operation refers to closed context.',
        };

      default:
        logger.warn(`Prisma error, ${err?.message}`);
        return {
          status: 400,
          code: 175,
          message: 'Invalid request.',
        };
    }
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    return {
      status: 400,
      code: 176,
      message: 'Invalid payload or validation failed.',
    };
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    // DB down, bad connection string, etc.
    return {
      status: 503,
      code: 177,
      message: 'Service temporarily unavailable.',
    };
  }

  if (err instanceof Prisma.PrismaClientUnknownRequestError) {
    logger.error(`Prisma unknown request error: ${err.message}`);
    if (err.message.includes('23514') || err.message.includes('check constraint')) {
      return {
        status: 400,
        code: 178,
        message: 'Request violates a database check constraint.',
      };
    }
    return {
      status: 500,
      code: 178,
      message: 'Unknown request error.',
    };
  }

  if (err instanceof Prisma.PrismaClientRustPanicError) {
    return {
      status: 500,
      code: 179,
      message: 'Prisma internal Rust panic. Please restart the service.',
    };
  }

  return null;
}
