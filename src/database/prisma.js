"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDatabase = connectToDatabase;
exports.disconnectFromDatabase = disconnectFromDatabase;
exports.checkDatabaseConnection = checkDatabaseConnection;
exports.getDatabaseInfo = getDatabaseInfo;
exports.withTransaction = withTransaction;
exports.gracefulShutdown = gracefulShutdown;
var client_1 = require("@prisma/client");
var logger_js_1 = require("@/utils/logger.js");
// Prisma client configuration
var prismaConfig = {
    log: [
        {
            emit: 'event',
            level: 'query',
        },
        {
            emit: 'event',
            level: 'error',
        },
        {
            emit: 'event',
            level: 'info',
        },
        {
            emit: 'event',
            level: 'warn',
        },
    ],
    // Connection pool settings
    datasources: {
        db: {
            url: process.env.DATABASE_URL,
        },
    },
};
// Create Prisma client with singleton pattern for development
function createPrismaClient() {
    var prisma = new client_1.PrismaClient(prismaConfig);
    // Log queries in development
    if (process.env.NODE_ENV !== 'production') {
        prisma.$on('query', function (e) {
            logger_js_1.dbLogger.debug({
                query: e.query,
                params: e.params,
                duration: e.duration,
                target: e.target,
            }, 'Query executed');
        });
    }
    // Log errors
    prisma.$on('error', function (e) {
        logger_js_1.dbLogger.error({
            message: e.message,
            target: e.target,
        }, 'Database error');
    });
    // Log info messages
    prisma.$on('info', function (e) {
        logger_js_1.dbLogger.info({
            message: e.message,
            target: e.target,
        }, 'Database info');
    });
    // Log warnings
    prisma.$on('warn', function (e) {
        logger_js_1.dbLogger.warn({
            message: e.message,
            target: e.target,
        }, 'Database warning');
    });
    return prisma;
}
// Singleton pattern: reuse connection in development to avoid too many connections
var prisma = (_a = globalThis.__prisma) !== null && _a !== void 0 ? _a : createPrismaClient();
if (process.env.NODE_ENV !== 'production') {
    globalThis.__prisma = prisma;
}
// Connection management functions
function connectToDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, prisma.$connect()];
                case 1:
                    _a.sent();
                    logger_js_1.dbLogger.info({
                        database: 'postgresql',
                        environment: process.env.NODE_ENV || 'development',
                    }, 'Database connected successfully');
                    // Test the connection
                    return [4 /*yield*/, prisma.$queryRaw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["SELECT 1"], ["SELECT 1"])))];
                case 2:
                    // Test the connection
                    _a.sent();
                    logger_js_1.dbLogger.debug('Database connection test passed');
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _a.sent();
                    logger_js_1.dbLogger.error({
                        error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                        stack: error_1 instanceof Error ? error_1.stack : undefined,
                    }, 'Failed to connect to database');
                    throw new Error('Database connection failed');
                case 4: return [2 /*return*/];
            }
        });
    });
}
function disconnectFromDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, prisma.$disconnect()];
                case 1:
                    _a.sent();
                    logger_js_1.dbLogger.info('Database disconnected successfully');
                    return [3 /*break*/, 3];
                case 2:
                    error_2 = _a.sent();
                    logger_js_1.dbLogger.error({
                        error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                    }, 'Error disconnecting from database');
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    });
}
// Health check function
function checkDatabaseConnection() {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, responseTime, error_3, responseTime, errorMessage;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, prisma.$queryRaw(templateObject_2 || (templateObject_2 = __makeTemplateObject(["SELECT 1"], ["SELECT 1"])))];
                case 2:
                    _a.sent();
                    responseTime = Date.now() - startTime;
                    logger_js_1.dbLogger.debug({ responseTime: responseTime }, 'Database health check passed');
                    return [2 /*return*/, {
                            isConnected: true,
                            responseTime: responseTime,
                        }];
                case 3:
                    error_3 = _a.sent();
                    responseTime = Date.now() - startTime;
                    errorMessage = error_3 instanceof Error ? error_3.message : 'Unknown database error';
                    logger_js_1.dbLogger.error({
                        error: errorMessage,
                        responseTime: responseTime,
                    }, 'Database health check failed');
                    return [2 /*return*/, {
                            isConnected: false,
                            responseTime: responseTime,
                            error: errorMessage,
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Get connection info
function getDatabaseInfo() {
    return __awaiter(this, void 0, void 0, function () {
        var versionResult, version, connectionStats, stats, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, prisma.$queryRaw(templateObject_3 || (templateObject_3 = __makeTemplateObject(["SELECT version()"], ["SELECT version()"])))];
                case 1:
                    versionResult = _b.sent();
                    version = ((_a = versionResult[0]) === null || _a === void 0 ? void 0 : _a.version) || 'Unknown';
                    return [4 /*yield*/, prisma.$queryRaw(templateObject_4 || (templateObject_4 = __makeTemplateObject(["\n      SELECT\n        'max_connections' as setting,\n        COALESCE((SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 0) as max_connections,\n        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections\n    "], ["\n      SELECT\n        'max_connections' as setting,\n        COALESCE((SELECT setting::int FROM pg_settings WHERE name = 'max_connections'), 0) as max_connections,\n        (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections\n    "])))];
                case 2:
                    connectionStats = _b.sent();
                    stats = connectionStats[0];
                    logger_js_1.dbLogger.debug({
                        version: version.split(' ')[0], // Just the version number
                        maxConnections: (stats === null || stats === void 0 ? void 0 : stats.max_connections) || 0,
                        activeConnections: (stats === null || stats === void 0 ? void 0 : stats.active_connections) || 0,
                    }, 'Database info retrieved');
                    return [2 /*return*/, {
                            version: version.split(' ')[0],
                            maxConnections: (stats === null || stats === void 0 ? void 0 : stats.max_connections) || 0,
                            activeConnections: (stats === null || stats === void 0 ? void 0 : stats.active_connections) || 0,
                        }];
                case 3:
                    error_4 = _b.sent();
                    logger_js_1.dbLogger.warn({
                        error: error_4 instanceof Error ? error_4.message : 'Unknown error',
                    }, 'Could not retrieve database info');
                    return [2 /*return*/, {
                            version: 'Unknown',
                            maxConnections: 0,
                            activeConnections: 0,
                        }];
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Database transaction helper
function withTransaction(operation) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, result, duration, error_5, duration;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    startTime = Date.now();
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, prisma.$transaction(function (tx) { return __awaiter(_this, void 0, void 0, function () {
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, operation(tx)];
                                    case 1: return [2 /*return*/, _a.sent()];
                                }
                            });
                        }); })];
                case 2:
                    result = _a.sent();
                    duration = Date.now() - startTime;
                    logger_js_1.dbLogger.debug({ duration: duration }, 'Transaction completed successfully');
                    return [2 /*return*/, result];
                case 3:
                    error_5 = _a.sent();
                    duration = Date.now() - startTime;
                    logger_js_1.dbLogger.error({
                        error: error_5 instanceof Error ? error_5.message : 'Unknown error',
                        duration: duration,
                    }, 'Transaction failed');
                    throw error_5;
                case 4: return [2 /*return*/];
            }
        });
    });
}
// Graceful shutdown helper
function gracefulShutdown() {
    return __awaiter(this, void 0, void 0, function () {
        var error_6;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    logger_js_1.dbLogger.info('Starting graceful database shutdown');
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    // Wait for ongoing operations to complete (you can implement your own logic here)
                    return [4 /*yield*/, new Promise(function (resolve) { return setTimeout(resolve, 1000); })];
                case 2:
                    // Wait for ongoing operations to complete (you can implement your own logic here)
                    _a.sent();
                    // Disconnect from database
                    return [4 /*yield*/, disconnectFromDatabase()];
                case 3:
                    // Disconnect from database
                    _a.sent();
                    logger_js_1.dbLogger.info('Graceful database shutdown completed');
                    return [3 /*break*/, 5];
                case 4:
                    error_6 = _a.sent();
                    logger_js_1.dbLogger.error({
                        error: error_6 instanceof Error ? error_6.message : 'Unknown error',
                    }, 'Error during graceful database shutdown');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    });
}
exports.default = prisma;
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
