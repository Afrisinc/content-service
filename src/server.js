"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
var prisma_js_1 = require("@/database/prisma.js");
var logger_js_1 = require("@/utils/logger.js");
var app_js_1 = require("./app.js");
var env_js_1 = require("./config/env.js");
// Global error handlers
process.on('uncaughtException', function (error) {
    logger_js_1.logger.fatal({
        error: error.message,
        stack: error.stack,
    }, 'Uncaught Exception');
    process.exit(1);
});
process.on('unhandledRejection', function (reason, _promise) {
    logger_js_1.logger.fatal({
        reason: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
    }, 'Unhandled Rejection');
    process.exit(1);
});
// Graceful shutdown handling
var isShuttingDown = false;
var gracefulShutdownHandler = function (signal) { return __awaiter(void 0, void 0, void 0, function () {
    var shutdownTimeout, error_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (isShuttingDown) {
                    logger_js_1.logger.warn('Force shutdown requested');
                    process.exit(1);
                }
                isShuttingDown = true;
                logger_js_1.logger.info("Received ".concat(signal, ", starting graceful shutdown"));
                _a.label = 1;
            case 1:
                _a.trys.push([1, 5, , 6]);
                shutdownTimeout = setTimeout(function () {
                    logger_js_1.logger.error('Shutdown timeout reached, forcing exit');
                    process.exit(1);
                }, 30000);
                if (!global.fastifyApp) return [3 /*break*/, 3];
                logger_js_1.logger.info('Closing Fastify server');
                return [4 /*yield*/, global.fastifyApp.close()];
            case 2:
                _a.sent();
                logger_js_1.logger.info('Fastify server closed');
                _a.label = 3;
            case 3:
                // Close database connections
                logger_js_1.logger.info('Closing database connections');
                return [4 /*yield*/, (0, prisma_js_1.gracefulShutdown)()];
            case 4:
                _a.sent();
                // Clear the shutdown timeout
                clearTimeout(shutdownTimeout);
                logger_js_1.logger.info('Graceful shutdown completed');
                process.exit(0);
                return [3 /*break*/, 6];
            case 5:
                error_1 = _a.sent();
                logger_js_1.logger.error({
                    error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                    stack: error_1 instanceof Error ? error_1.stack : undefined,
                }, 'Error during graceful shutdown');
                process.exit(1);
                return [3 /*break*/, 6];
            case 6: return [2 /*return*/];
        }
    });
}); };
// Register signal handlers for graceful shutdown
process.on('SIGTERM', function () { return gracefulShutdownHandler('SIGTERM'); });
process.on('SIGINT', function () { return gracefulShutdownHandler('SIGINT'); });
var start = function () { return __awaiter(void 0, void 0, void 0, function () {
    var app, PORT, HOST, memoryUsage, error_2, cleanupError_1;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                _a.trys.push([0, 4, , 9]);
                logger_js_1.startupLogger.info({
                    nodeVersion: process.version,
                    environment: process.env.NODE_ENV || 'development',
                    port: env_js_1.env.PORT,
                }, 'Starting application');
                // Connect to database first
                logger_js_1.startupLogger.info({}, 'Connecting to database');
                return [4 /*yield*/, (0, prisma_js_1.connectToDatabase)()];
            case 1:
                _a.sent();
                // Create and start the app
                logger_js_1.startupLogger.info({}, 'Creating Fastify application');
                return [4 /*yield*/, (0, app_js_1.createApp)()];
            case 2:
                app = _a.sent();
                // Store app globally for graceful shutdown
                global.fastifyApp = app;
                PORT = Number(env_js_1.env.PORT);
                HOST = '0.0.0.0';
                logger_js_1.startupLogger.info({ port: PORT, host: HOST }, 'Starting server');
                return [4 /*yield*/, app.listen({ port: PORT, host: HOST })];
            case 3:
                _a.sent();
                logger_js_1.startupLogger.info({
                    port: PORT,
                    host: HOST,
                    environment: process.env.NODE_ENV || 'development',
                    pid: process.pid,
                    swagger: "http://localhost:".concat(PORT, "/docs"),
                    health: "http://localhost:".concat(PORT, "/health"),
                }, 'Server started successfully');
                memoryUsage = process.memoryUsage();
                logger_js_1.startupLogger.debug({
                    heapUsed: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
                    heapTotal: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100,
                    external: Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100,
                    unit: 'MB',
                }, 'Initial memory usage');
                return [3 /*break*/, 9];
            case 4:
                error_2 = _a.sent();
                logger_js_1.startupLogger.fatal({
                    error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                    stack: error_2 instanceof Error ? error_2.stack : undefined,
                }, 'Failed to start application');
                _a.label = 5;
            case 5:
                _a.trys.push([5, 7, , 8]);
                return [4 /*yield*/, (0, prisma_js_1.gracefulShutdown)()];
            case 6:
                _a.sent();
                return [3 /*break*/, 8];
            case 7:
                cleanupError_1 = _a.sent();
                logger_js_1.logger.error({
                    error: cleanupError_1 instanceof Error ? cleanupError_1.message : 'Unknown error',
                }, 'Error during startup cleanup');
                return [3 /*break*/, 8];
            case 8:
                process.exit(1);
                return [3 /*break*/, 9];
            case 9: return [2 /*return*/];
        }
    });
}); };
// Add process event listeners for monitoring
process.on('warning', function (warning) {
    logger_js_1.logger.warn({
        name: warning.name,
        message: warning.message,
        stack: warning.stack,
    }, 'Process warning');
});
// Memory usage monitoring (optional - for debugging)
if (process.env.NODE_ENV !== 'production') {
    setInterval(function () {
        var memoryUsage = process.memoryUsage();
        var cpuUsage = process.cpuUsage();
        logger_js_1.logger.debug({
            memory: {
                heapUsed: Math.round((memoryUsage.heapUsed / 1024 / 1024) * 100) / 100,
                heapTotal: Math.round((memoryUsage.heapTotal / 1024 / 1024) * 100) / 100,
                external: Math.round((memoryUsage.external / 1024 / 1024) * 100) / 100,
                unit: 'MB',
            },
            cpu: {
                user: cpuUsage.user,
                system: cpuUsage.system,
            },
            uptime: process.uptime(),
        }, 'Process metrics');
    }, 60000); // Log every minute
}
start();
