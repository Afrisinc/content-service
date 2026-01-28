"use strict";
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createError = exports.errorHandler = exports.DatabaseError = exports.ConflictError = exports.NotFoundError = exports.AuthorizationError = exports.AuthenticationError = exports.ValidationError = exports.AppError = void 0;
var zod_1 = require("zod");
var client_1 = require("@prisma/client");
var logger_js_1 = require("@/utils/logger.js");
// Custom error types
var AppError = /** @class */ (function (_super) {
    __extends(AppError, _super);
    function AppError(message, statusCode, isOperational, code) {
        if (statusCode === void 0) { statusCode = 500; }
        if (isOperational === void 0) { isOperational = true; }
        var _this = _super.call(this, message) || this;
        _this.statusCode = statusCode;
        _this.isOperational = isOperational;
        _this.code = code;
        Object.setPrototypeOf(_this, AppError.prototype);
        Error.captureStackTrace(_this, _this.constructor);
        return _this;
    }
    return AppError;
}(Error));
exports.AppError = AppError;
var ValidationError = /** @class */ (function (_super) {
    __extends(ValidationError, _super);
    function ValidationError(message, details) {
        var _this = _super.call(this, message, 400, true, 'VALIDATION_ERROR') || this;
        _this.name = 'ValidationError';
        return _this;
    }
    return ValidationError;
}(AppError));
exports.ValidationError = ValidationError;
var AuthenticationError = /** @class */ (function (_super) {
    __extends(AuthenticationError, _super);
    function AuthenticationError(message) {
        if (message === void 0) { message = 'Authentication failed'; }
        var _this = _super.call(this, message, 401, true, 'AUTHENTICATION_ERROR') || this;
        _this.name = 'AuthenticationError';
        return _this;
    }
    return AuthenticationError;
}(AppError));
exports.AuthenticationError = AuthenticationError;
var AuthorizationError = /** @class */ (function (_super) {
    __extends(AuthorizationError, _super);
    function AuthorizationError(message) {
        if (message === void 0) { message = 'Access denied'; }
        var _this = _super.call(this, message, 403, true, 'AUTHORIZATION_ERROR') || this;
        _this.name = 'AuthorizationError';
        return _this;
    }
    return AuthorizationError;
}(AppError));
exports.AuthorizationError = AuthorizationError;
var NotFoundError = /** @class */ (function (_super) {
    __extends(NotFoundError, _super);
    function NotFoundError(message) {
        if (message === void 0) { message = 'Resource not found'; }
        var _this = _super.call(this, message, 404, true, 'NOT_FOUND_ERROR') || this;
        _this.name = 'NotFoundError';
        return _this;
    }
    return NotFoundError;
}(AppError));
exports.NotFoundError = NotFoundError;
var ConflictError = /** @class */ (function (_super) {
    __extends(ConflictError, _super);
    function ConflictError(message) {
        if (message === void 0) { message = 'Resource conflict'; }
        var _this = _super.call(this, message, 409, true, 'CONFLICT_ERROR') || this;
        _this.name = 'ConflictError';
        return _this;
    }
    return ConflictError;
}(AppError));
exports.ConflictError = ConflictError;
var DatabaseError = /** @class */ (function (_super) {
    __extends(DatabaseError, _super);
    function DatabaseError(message) {
        if (message === void 0) { message = 'Database operation failed'; }
        var _this = _super.call(this, message, 500, true, 'DATABASE_ERROR') || this;
        _this.name = 'DatabaseError';
        return _this;
    }
    return DatabaseError;
}(AppError));
exports.DatabaseError = DatabaseError;
// Helper function to determine if error should be logged
var shouldLogError = function (statusCode) {
    return statusCode >= 500;
};
// Helper function to sanitize error for client
var sanitizeError = function (error, statusCode) {
    var isDevelopment = process.env.NODE_ENV !== 'production';
    // In production, don't expose internal error details for 5xx errors
    if (!isDevelopment && statusCode >= 500) {
        return {
            message: 'Internal Server Error',
            details: undefined,
        };
    }
    return {
        message: error.message || 'An error occurred',
        details: error.details || undefined,
    };
};
var errorHandler = function (error, request, reply) {
    var statusCode = 500;
    var errorCode;
    var message = 'Internal Server Error';
    var details;
    // Handle different error types
    if (error instanceof AppError) {
        statusCode = error.statusCode;
        message = error.message;
        errorCode = error.code;
    }
    else if (error instanceof zod_1.ZodError) {
        // Zod validation errors
        statusCode = 400;
        errorCode = 'VALIDATION_ERROR';
        message = 'Validation failed';
        details = error.errors.map(function (err) { return ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
        }); });
    }
    else if (error instanceof client_1.Prisma.PrismaClientKnownRequestError) {
        // Prisma database errors
        statusCode = 400;
        errorCode = 'DATABASE_ERROR';
        switch (error.code) {
            case 'P2002':
                statusCode = 409;
                message = 'Resource already exists';
                errorCode = 'UNIQUE_CONSTRAINT_ERROR';
                break;
            case 'P2025':
                statusCode = 404;
                message = 'Resource not found';
                errorCode = 'NOT_FOUND_ERROR';
                break;
            case 'P2003':
                statusCode = 400;
                message = 'Foreign key constraint failed';
                errorCode = 'FOREIGN_KEY_ERROR';
                break;
            default:
                statusCode = 500;
                message = 'Database operation failed';
        }
    }
    else if (error instanceof client_1.Prisma.PrismaClientUnknownRequestError) {
        statusCode = 500;
        errorCode = 'DATABASE_ERROR';
        message = 'Unknown database error';
    }
    else if (error instanceof client_1.Prisma.PrismaClientRustPanicError) {
        statusCode = 500;
        errorCode = 'DATABASE_ERROR';
        message = 'Database engine error';
    }
    else if (error instanceof client_1.Prisma.PrismaClientInitializationError) {
        statusCode = 500;
        errorCode = 'DATABASE_CONNECTION_ERROR';
        message = 'Database connection failed';
    }
    else if (error instanceof client_1.Prisma.PrismaClientValidationError) {
        statusCode = 400;
        errorCode = 'DATABASE_VALIDATION_ERROR';
        message = 'Database validation failed';
    }
    else if ('statusCode' in error && typeof error.statusCode === 'number') {
        // Fastify errors
        statusCode = error.statusCode;
        message = error.message || 'Request failed';
    }
    else {
        // Generic errors
        statusCode = 500;
        message = error.message || 'Internal Server Error';
    }
    // Sanitize error for client
    var sanitized = sanitizeError({ message: message, details: details }, statusCode);
    // Log error if it's a server error
    if (shouldLogError(statusCode)) {
        logger_js_1.logger.error({
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: errorCode,
            },
            request: {
                method: request.method,
                url: request.url,
                headers: request.headers,
                params: request.params,
                query: request.query,
                ip: request.ip,
                userAgent: request.headers['user-agent'],
            },
            statusCode: statusCode,
            timestamp: new Date().toISOString(),
        }, "".concat(error.name || 'Error', ": ").concat(error.message));
    }
    else {
        // Log as warning for client errors (4xx)
        logger_js_1.logger.warn({
            error: {
                name: error.name,
                message: error.message,
                code: errorCode,
            },
            request: {
                method: request.method,
                url: request.url,
                ip: request.ip,
            },
            statusCode: statusCode,
            timestamp: new Date().toISOString(),
        }, "".concat(error.name || 'Client Error', ": ").concat(error.message));
    }
    // Create error response
    var errorResponse = __assign(__assign({ error: getErrorName(statusCode), message: sanitized.message, statusCode: statusCode, timestamp: new Date().toISOString(), path: request.url }, (errorCode && { code: errorCode })), (sanitized.details && { details: sanitized.details }));
    // Send error response
    reply.code(statusCode).send(errorResponse);
};
exports.errorHandler = errorHandler;
// Helper function to get error name from status code
function getErrorName(statusCode) {
    switch (statusCode) {
        case 400:
            return 'Bad Request';
        case 401:
            return 'Unauthorized';
        case 403:
            return 'Forbidden';
        case 404:
            return 'Not Found';
        case 409:
            return 'Conflict';
        case 422:
            return 'Unprocessable Entity';
        case 429:
            return 'Too Many Requests';
        case 500:
            return 'Internal Server Error';
        case 502:
            return 'Bad Gateway';
        case 503:
            return 'Service Unavailable';
        case 504:
            return 'Gateway Timeout';
        default:
            return 'Error';
    }
}
// Helper function to create standardized errors
exports.createError = {
    badRequest: function (message, details) { return new ValidationError(message, details); },
    unauthorized: function (message) { return new AuthenticationError(message); },
    forbidden: function (message) { return new AuthorizationError(message); },
    notFound: function (message) { return new NotFoundError(message); },
    conflict: function (message) { return new ConflictError(message); },
    internal: function (message) { return new AppError(message || 'Internal Server Error', 500); },
    database: function (message) { return new DatabaseError(message); },
};
