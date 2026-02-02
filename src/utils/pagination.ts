/**
 * Pagination Utility
 * Provides helper functions for handling pagination in queries
 */

export interface PaginationParams {
  page?: number | string;
  limit?: number | string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

/**
 * Parse and validate pagination parameters
 */
export function parsePagination(params: PaginationParams, defaultLimit = 10, maxLimit = 100) {
  let page = typeof params.page === 'string' ? parseInt(params.page, 10) : params.page || 1;
  let limit = typeof params.limit === 'string' ? parseInt(params.limit, 10) : params.limit || defaultLimit;

  // Validate page
  page = Math.max(1, page);

  // Validate limit
  limit = Math.max(1, Math.min(limit, maxLimit));

  return { page, limit };
}

/**
 * Calculate pagination offset for database queries
 */
export function calculateOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

/**
 * Build paginated response
 */
export function buildPaginatedResponse<T>(data: T[], total: number, page: number, limit: number): PaginatedResponse<T> {
  const totalPages = Math.ceil(total / limit);

  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
    },
  };
}
