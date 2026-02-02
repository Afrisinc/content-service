import type { FastifyReply } from 'fastify';

/**
 * Afrisinc API Response Codes
 * Based on Afrisinc Response Standard v1.0.0
 */
export enum ResponseCode {
  // 1xxx - Success
  SUCCESS = 1000,
  CREATED = 1001,
  UPDATED = 1002,
  DELETED = 1003,
  ACCEPTED = 1004,

  // 2xxx - Client Errors
  INVALID_REQUEST = 2000,
  MISSING_FIELDS = 2001,
  INVALID_FORMAT = 2002,
  DUPLICATE_ENTRY = 2003,
  NOT_FOUND = 2004,
  UNSUPPORTED_ACTION = 2005,

  // 3xxx - Authentication & Authorization
  AUTH_REQUIRED = 3000,
  INVALID_CREDENTIALS = 3001,
  TOKEN_EXPIRED = 3002,
  TOKEN_INVALID = 3003,
  ACCESS_DENIED = 3004,

  // 4xxx - Business Logic Errors
  OPERATION_NOT_ALLOWED = 4000,
  BUSINESS_RULE_VIOLATION = 4001,
  QUOTA_EXCEEDED = 4002,
  CONFLICT = 4003,
  EXTERNAL_SERVICE_ERROR = 4004,

  // 5xxx - System Errors
  INTERNAL_ERROR = 5000,
  DATABASE_ERROR = 5001,
  SERVICE_UNAVAILABLE = 5002,
  UNEXPECTED_ERROR = 5003,
  TIMEOUT = 5004,

  // 9xxx - Critical Errors
  SYSTEM_FAILURE = 9000,
  DATA_CORRUPTION = 9001,
  SECURITY_INCIDENT = 9002,
  INFRASTRUCTURE_OUTAGE = 9003,
}

/**
 * Standard API Response Structure
 */
interface ApiResponse {
  success: boolean;
  resp_msg: string;
  resp_code: number;
  data?: any;
}

/**
 * Serialize data for JSON response, converting BigInt to string
 */
function serializeData(data: any): any {
  // Handle primitives and null/undefined
  if (data === null || data === undefined || typeof data !== 'object') {
    if (typeof data === 'bigint') {
      return data.toString();
    }
    return data;
  }

  // Use JSON.stringify with BigInt replacer for robust serialization
  try {
    const jsonString = JSON.stringify(data, (_, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
    return JSON.parse(jsonString);
  } catch {
    // Fallback: manually convert object properties
    const serialized: any = Array.isArray(data) ? [] : {};
    for (const key in data) {
      if (Object.hasOwn(data, key)) {
        const value = data[key];
        serialized[key] = typeof value === 'bigint' ? value.toString() : value;
      }
    }
    return serialized;
  }
}

/**
 * Professional API Response Helper
 * Follows Afrisinc Response Standard v1.0.0
 */
export class ApiResponseHelper {
  /**
   * Send a success response
   * @param reply FastifyReply object
   * @param message Human-readable message
   * @param data Response payload
   * @param respCode Internal response code (default: 1000)
   * @param httpCode HTTP status code (default: 200)
   */
  static success(
    reply: FastifyReply,
    message: string,
    data?: any,
    respCode: number = ResponseCode.SUCCESS,
    httpCode: number = 200
  ): FastifyReply {
    const response: ApiResponse = {
      success: true,
      resp_msg: message,
      resp_code: respCode,
      data: serializeData(data) || null,
    };
    return reply.status(httpCode).send(response);
  }

  /**
   * Send a created (201) response
   * @param reply FastifyReply object
   * @param message Human-readable message
   * @param data Created resource data
   */
  static created(reply: FastifyReply, message: string, data?: any): FastifyReply {
    return this.success(reply, message, data, ResponseCode.CREATED, 201);
  }

  /**
   * Send an updated (200) response
   * @param reply FastifyReply object
   * @param message Human-readable message
   * @param data Updated resource data
   */
  static updated(reply: FastifyReply, message: string, data?: any): FastifyReply {
    return this.success(reply, message, data, ResponseCode.UPDATED, 200);
  }

  /**
   * Send a deleted (200) response
   * @param reply FastifyReply object
   * @param message Human-readable message
   */
  static deleted(reply: FastifyReply, message: string = 'Resource deleted successfully'): FastifyReply {
    return this.success(reply, message, null, ResponseCode.DELETED, 200);
  }

  /**
   * Send an error response
   * @param reply FastifyReply object
   * @param message Human-readable error message
   * @param respCode Internal response code
   * @param httpCode HTTP status code
   */
  static error(
    reply: FastifyReply,
    message: string,
    respCode: number = ResponseCode.INVALID_REQUEST,
    httpCode: number = 400
  ): FastifyReply {
    const response: ApiResponse = {
      success: false,
      resp_msg: message,
      resp_code: respCode,
    };
    return reply.status(httpCode).send(response);
  }

  /**
   * 400 Bad Request - Invalid request payload
   */
  static badRequest(reply: FastifyReply, message: string = 'Invalid request payload'): FastifyReply {
    return this.error(reply, message, ResponseCode.INVALID_REQUEST, 400);
  }

  /**
   * 400 Bad Request - Missing required fields
   */
  static missingFields(reply: FastifyReply, message: string = 'Missing required fields'): FastifyReply {
    return this.error(reply, message, ResponseCode.MISSING_FIELDS, 400);
  }

  /**
   * 400 Bad Request - Invalid field format
   */
  static invalidFormat(reply: FastifyReply, message: string = 'Invalid field format'): FastifyReply {
    return this.error(reply, message, ResponseCode.INVALID_FORMAT, 400);
  }

  /**
   * 409 Conflict - Duplicate entry
   */
  static duplicate(reply: FastifyReply, message: string = 'Resource already exists'): FastifyReply {
    return this.error(reply, message, ResponseCode.DUPLICATE_ENTRY, 409);
  }

  /**
   * 404 Not Found - Resource not found
   */
  static notFound(reply: FastifyReply, message: string = 'Resource not found'): FastifyReply {
    return this.error(reply, message, ResponseCode.NOT_FOUND, 404);
  }

  /**
   * 401 Unauthorized - Authentication required
   */
  static unauthorized(reply: FastifyReply, message: string = 'Authentication required'): FastifyReply {
    return this.error(reply, message, ResponseCode.AUTH_REQUIRED, 401);
  }

  /**
   * 401 Unauthorized - Invalid credentials
   */
  static invalidCredentials(reply: FastifyReply, message: string = 'Invalid credentials'): FastifyReply {
    return this.error(reply, message, ResponseCode.INVALID_CREDENTIALS, 401);
  }

  /**
   * 401 Unauthorized - Token expired
   */
  static tokenExpired(reply: FastifyReply, message: string = 'Token has expired'): FastifyReply {
    return this.error(reply, message, ResponseCode.TOKEN_EXPIRED, 401);
  }

  /**
   * 401 Unauthorized - Invalid token
   */
  static tokenInvalid(reply: FastifyReply, message: string = 'Invalid token'): FastifyReply {
    return this.error(reply, message, ResponseCode.TOKEN_INVALID, 401);
  }

  /**
   * 403 Forbidden - Access denied
   */
  static forbidden(reply: FastifyReply, message: string = 'Access denied'): FastifyReply {
    return this.error(reply, message, ResponseCode.ACCESS_DENIED, 403);
  }

  /**
   * 409 Conflict - Business rule violation
   */
  static conflict(reply: FastifyReply, message: string = 'Operation conflict'): FastifyReply {
    return this.error(reply, message, ResponseCode.CONFLICT, 409);
  }

  /**
   * 429 Too Many Requests - Quota exceeded
   */
  static quotaExceeded(reply: FastifyReply, message: string = 'Quota limit exceeded'): FastifyReply {
    return this.error(reply, message, ResponseCode.QUOTA_EXCEEDED, 429);
  }

  /**
   * 500 Internal Server Error
   */
  static internalError(reply: FastifyReply, message: string = 'Internal server error'): FastifyReply {
    return this.error(reply, message, ResponseCode.INTERNAL_ERROR, 500);
  }

  /**
   * 500 Internal Server Error - Database error
   */
  static databaseError(reply: FastifyReply, message: string = 'Database error'): FastifyReply {
    return this.error(reply, message, ResponseCode.DATABASE_ERROR, 500);
  }

  /**
   * 503 Service Unavailable
   */
  static serviceUnavailable(reply: FastifyReply, message: string = 'Service unavailable'): FastifyReply {
    return this.error(reply, message, ResponseCode.SERVICE_UNAVAILABLE, 503);
  }

  /**
   * 504 Gateway Timeout
   */
  static timeout(reply: FastifyReply, message: string = 'Request timeout'): FastifyReply {
    return this.error(reply, message, ResponseCode.TIMEOUT, 504);
  }
}
