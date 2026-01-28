"use strict";
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
exports.startupLogger = exports.healthLogger = exports.auditLogger = exports.createRequestLogger = exports.logPerformance = exports.logError = exports.perfLogger = exports.authLogger = exports.dbLogger = exports.requestLogger = exports.logger = void 0;
var pino_1 = require("pino");
// Environment-based configuration
var isDevelopment = process.env.NODE_ENV !== 'production';
var logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');
// Create logger instance
exports.logger = (0, pino_1.default)(__assign(__assign(__assign({ level: logLevel }, (isDevelopment && {
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
            singleLine: false,
            messageFormat: '{msg}',
        },
    },
})), (!isDevelopment && {
    formatters: {
        level: function (label) {
            return { level: label };
        },
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    redact: {
        paths: [
            'password',
            'token',
            'authorization',
            'cookie',
            'session',
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers["set-cookie"]',
            'email',
            'phoneNumber',
            'ssn',
            'creditCard',
        ],
        censor: '[REDACTED]',
    },
})), { 
    // Base fields for all log entries
    base: {
        pid: process.pid,
        hostname: process.env.HOSTNAME || 'unknown',
        service: 'backend-template',
        version: process.env.npm_package_version || '1.0.0',
    } }));
// Request logger for Fastify
exports.requestLogger = (0, pino_1.default)(__assign(__assign(__assign({ level: logLevel }, (isDevelopment && {
    transport: {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname,reqId',
            singleLine: true,
            messageFormat: '{req.method} {req.url} - {msg}',
        },
    },
})), (!isDevelopment && {
    formatters: {
        level: function (label) {
            return { level: label };
        },
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
    redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
        censor: '[REDACTED]',
    },
})), { base: {
        pid: process.pid,
        hostname: process.env.HOSTNAME || 'unknown',
        service: 'backend-template-http',
        version: process.env.npm_package_version || '1.0.0',
    } }));
// Database logger
exports.dbLogger = exports.logger.child({ component: 'database' });
// Auth logger
exports.authLogger = exports.logger.child({ component: 'auth' });
// Performance logger
exports.perfLogger = exports.logger.child({ component: 'performance' });
// Error logger with stack trace
var logError = function (error, context) {
    if (error instanceof Error) {
        exports.logger.error(__assign({ err: error, stack: error.stack }, context), error.message);
    }
    else {
        exports.logger.error(__assign({ error: String(error) }, context), 'Unknown error occurred');
    }
};
exports.logError = logError;
// Performance monitoring helper
var logPerformance = function (operation, duration, context) {
    exports.perfLogger.info(__assign({ operation: operation, duration: duration, unit: 'ms' }, context), "Operation ".concat(operation, " completed in ").concat(duration, "ms"));
};
exports.logPerformance = logPerformance;
// Request context logger
var createRequestLogger = function (requestId) {
    return exports.logger.child({ requestId: requestId });
};
exports.createRequestLogger = createRequestLogger;
// Audit logger for sensitive operations
exports.auditLogger = exports.logger.child({
    component: 'audit',
    type: 'security',
});
// Health check logger
exports.healthLogger = exports.logger.child({ component: 'health' });
// Startup logger
exports.startupLogger = exports.logger.child({ component: 'startup' });
exports.default = exports.logger;
