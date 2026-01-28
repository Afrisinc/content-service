"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
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
exports.metricsMiddleware = metricsMiddleware;
exports.default = healthRoutes;
var client_1 = require("@prisma/client");
var logger_js_1 = require("@/utils/logger.js");
// Simple in-memory metrics store
var MetricsStore = /** @class */ (function () {
    function MetricsStore() {
        this.requestCount = 0;
        this.errorCount = 0;
        this.responseTimes = [];
        this.startTime = Date.now();
    }
    MetricsStore.prototype.incrementRequest = function () {
        this.requestCount++;
    };
    MetricsStore.prototype.incrementError = function () {
        this.errorCount++;
    };
    MetricsStore.prototype.addResponseTime = function (time) {
        this.responseTimes.push(time);
        // Keep only last 100 response times
        if (this.responseTimes.length > 100) {
            this.responseTimes = this.responseTimes.slice(-100);
        }
    };
    MetricsStore.prototype.getMetrics = function () {
        var averageResponseTime = this.responseTimes.length > 0 ? this.responseTimes.reduce(function (a, b) { return a + b; }, 0) / this.responseTimes.length : 0;
        var errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0;
        return {
            requestCount: this.requestCount,
            errorRate: Math.round(errorRate * 100) / 100,
            averageResponseTime: Math.round(averageResponseTime * 100) / 100,
            uptime: Date.now() - this.startTime,
        };
    };
    MetricsStore.prototype.reset = function () {
        this.requestCount = 0;
        this.errorCount = 0;
        this.responseTimes = [];
        this.startTime = Date.now();
    };
    return MetricsStore;
}());
var metricsStore = new MetricsStore();
// Health check functions
function checkDatabase(prisma) {
    return __awaiter(this, void 0, void 0, function () {
        var startTime, responseTime, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    startTime = Date.now();
                    return [4 /*yield*/, prisma.$queryRaw(templateObject_1 || (templateObject_1 = __makeTemplateObject(["SELECT 1"], ["SELECT 1"])))];
                case 1:
                    _a.sent();
                    responseTime = Date.now() - startTime;
                    logger_js_1.healthLogger.debug({ responseTime: responseTime }, 'Database health check passed');
                    return [2 /*return*/, {
                            status: 'healthy',
                            responseTime: responseTime,
                        }];
                case 2:
                    error_1 = _a.sent();
                    logger_js_1.healthLogger.error({ error: error_1 }, 'Database health check failed');
                    return [2 /*return*/, {
                            status: 'unhealthy',
                            error: error_1 instanceof Error ? error_1.message : 'Unknown database error',
                        }];
                case 3: return [2 /*return*/];
            }
        });
    });
}
function checkMemory() {
    var memoryUsage = process.memoryUsage();
    var totalMemory = memoryUsage.heapTotal;
    var usedMemory = memoryUsage.heapUsed;
    var percentage = (usedMemory / totalMemory) * 100;
    var status = 'healthy';
    if (percentage > 90) {
        status = 'critical';
    }
    else if (percentage > 75) {
        status = 'warning';
    }
    return {
        status: status,
        usage: {
            used: Math.round((usedMemory / 1024 / 1024) * 100) / 100, // MB
            total: Math.round((totalMemory / 1024 / 1024) * 100) / 100, // MB
            percentage: Math.round(percentage * 100) / 100,
        },
    };
}
function checkDisk() {
    // Simplified disk check - in a real application, you might want to use a library like 'node-disk-info'
    // For now, we'll just return healthy as we don't have disk usage info
    return {
        status: 'healthy',
    };
}
// Middleware to track metrics
function metricsMiddleware() {
    return function (request, reply) {
        return __awaiter(this, void 0, void 0, function () {
            var startTime;
            var _this = this;
            return __generator(this, function (_a) {
                startTime = Date.now();
                metricsStore.incrementRequest();
                reply.addHook('onSend', function () { return __awaiter(_this, void 0, void 0, function () {
                    var responseTime;
                    return __generator(this, function (_a) {
                        responseTime = Date.now() - startTime;
                        metricsStore.addResponseTime(responseTime);
                        if (reply.statusCode >= 400) {
                            metricsStore.incrementError();
                        }
                        return [2 /*return*/];
                    });
                }); });
                return [2 /*return*/];
            });
        });
    };
}
function healthRoutes(fastify) {
    return __awaiter(this, void 0, void 0, function () {
        var prisma;
        var _this = this;
        return __generator(this, function (_a) {
            prisma = new client_1.PrismaClient();
            // Basic health check - lightweight endpoint for load balancers
            fastify.get('/health', {
                schema: {
                    description: 'Basic health check endpoint',
                    tags: ['Health'],
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                status: { type: 'string', enum: ['healthy', 'unhealthy'] },
                                timestamp: { type: 'string' },
                                uptime: { type: 'number' },
                                version: { type: 'string' },
                            },
                        },
                    },
                },
            }, function (request, _reply) { return __awaiter(_this, void 0, void 0, function () {
                var response;
                return __generator(this, function (_a) {
                    response = {
                        status: 'healthy',
                        timestamp: new Date().toISOString(),
                        uptime: process.uptime(),
                        version: process.env.npm_package_version || '1.0.0',
                    };
                    logger_js_1.healthLogger.debug({
                        ip: request.ip,
                        userAgent: request.headers['user-agent'],
                    }, 'Basic health check requested');
                    return [2 /*return*/, response];
                });
            }); });
            // Detailed health check with metrics
            fastify.get('/health/detailed', {
                schema: {
                    description: 'Detailed health check with system metrics',
                    tags: ['Health'],
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                status: { type: 'string', enum: ['healthy', 'unhealthy'] },
                                timestamp: { type: 'string' },
                                uptime: { type: 'number' },
                                version: { type: 'string' },
                                checks: {
                                    type: 'object',
                                    properties: {
                                        database: {
                                            type: 'object',
                                            properties: {
                                                status: { type: 'string' },
                                                responseTime: { type: 'number' },
                                                error: { type: 'string' },
                                            },
                                        },
                                        memory: {
                                            type: 'object',
                                            properties: {
                                                status: { type: 'string' },
                                                usage: {
                                                    type: 'object',
                                                    properties: {
                                                        used: { type: 'number' },
                                                        total: { type: 'number' },
                                                        percentage: { type: 'number' },
                                                    },
                                                },
                                            },
                                        },
                                        disk: {
                                            type: 'object',
                                            properties: {
                                                status: { type: 'string' },
                                                usage: {
                                                    type: 'object',
                                                    properties: {
                                                        used: { type: 'number' },
                                                        total: { type: 'number' },
                                                        percentage: { type: 'number' },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                                metrics: {
                                    type: 'object',
                                    properties: {
                                        requestCount: { type: 'number' },
                                        errorRate: { type: 'number' },
                                        averageResponseTime: { type: 'number' },
                                    },
                                },
                            },
                        },
                        503: {
                            type: 'object',
                            properties: {
                                status: { type: 'string' },
                                timestamp: { type: 'string' },
                                checks: { type: 'object' },
                            },
                        },
                    },
                },
            }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var _a, databaseCheck, memoryCheck, diskCheck, metrics, isHealthy, response;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            logger_js_1.healthLogger.debug({
                                ip: request.ip,
                                userAgent: request.headers['user-agent'],
                            }, 'Detailed health check requested');
                            return [4 /*yield*/, Promise.all([
                                    checkDatabase(prisma),
                                    Promise.resolve(checkMemory()),
                                    Promise.resolve(checkDisk()),
                                ])];
                        case 1:
                            _a = _b.sent(), databaseCheck = _a[0], memoryCheck = _a[1], diskCheck = _a[2];
                            metrics = metricsStore.getMetrics();
                            isHealthy = databaseCheck.status === 'healthy' && memoryCheck.status !== 'critical' && diskCheck.status !== 'critical';
                            response = {
                                status: isHealthy ? 'healthy' : 'unhealthy',
                                timestamp: new Date().toISOString(),
                                uptime: process.uptime(),
                                version: process.env.npm_package_version || '1.0.0',
                                checks: {
                                    database: databaseCheck,
                                    memory: memoryCheck,
                                    disk: diskCheck,
                                },
                                metrics: {
                                    requestCount: metrics.requestCount,
                                    errorRate: metrics.errorRate,
                                    averageResponseTime: metrics.averageResponseTime,
                                },
                            };
                            // Log health status
                            if (!isHealthy) {
                                logger_js_1.healthLogger.warn({ response: response }, 'System health check failed');
                                reply.code(503);
                            }
                            else {
                                logger_js_1.healthLogger.debug({
                                    databaseResponseTime: databaseCheck.responseTime,
                                    memoryUsage: memoryCheck.usage.percentage,
                                    errorRate: metrics.errorRate,
                                }, 'System health check passed');
                            }
                            return [2 /*return*/, response];
                    }
                });
            }); });
            // Readiness check - for Kubernetes readiness probes
            fastify.get('/health/ready', {
                schema: {
                    description: 'Readiness check for Kubernetes',
                    tags: ['Health'],
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                status: { type: 'string' },
                                timestamp: { type: 'string' },
                                ready: { type: 'boolean' },
                            },
                        },
                        503: {
                            type: 'object',
                            properties: {
                                status: { type: 'string' },
                                timestamp: { type: 'string' },
                                ready: { type: 'boolean' },
                                error: { type: 'string' },
                            },
                        },
                    },
                },
            }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                var databaseCheck, isReady, error_2;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, checkDatabase(prisma)];
                        case 1:
                            databaseCheck = _a.sent();
                            isReady = databaseCheck.status === 'healthy';
                            if (!isReady) {
                                logger_js_1.healthLogger.warn({ databaseCheck: databaseCheck }, 'Readiness check failed');
                                reply.code(503);
                                return [2 /*return*/, {
                                        status: 'not ready',
                                        timestamp: new Date().toISOString(),
                                        ready: false,
                                        error: databaseCheck.error || 'Database not available',
                                    }];
                            }
                            logger_js_1.healthLogger.debug('Readiness check passed');
                            return [2 /*return*/, {
                                    status: 'ready',
                                    timestamp: new Date().toISOString(),
                                    ready: true,
                                }];
                        case 2:
                            error_2 = _a.sent();
                            logger_js_1.healthLogger.error({ error: error_2 }, 'Readiness check error');
                            reply.code(503);
                            return [2 /*return*/, {
                                    status: 'not ready',
                                    timestamp: new Date().toISOString(),
                                    ready: false,
                                    error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                                }];
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            // Liveness check - for Kubernetes liveness probes
            fastify.get('/health/live', {
                schema: {
                    description: 'Liveness check for Kubernetes',
                    tags: ['Health'],
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                status: { type: 'string' },
                                timestamp: { type: 'string' },
                                alive: { type: 'boolean' },
                            },
                        },
                    },
                },
            }, function (_request, _reply) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    // Simple liveness check - if we can respond, we're alive
                    logger_js_1.healthLogger.debug('Liveness check requested');
                    return [2 /*return*/, {
                            status: 'alive',
                            timestamp: new Date().toISOString(),
                            alive: true,
                        }];
                });
            }); });
            // Metrics endpoint
            fastify.get('/health/metrics', {
                schema: {
                    description: 'Application metrics endpoint',
                    tags: ['Health'],
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                timestamp: { type: 'string' },
                                uptime: { type: 'number' },
                                requestCount: { type: 'number' },
                                errorRate: { type: 'number' },
                                averageResponseTime: { type: 'number' },
                                memory: {
                                    type: 'object',
                                    properties: {
                                        used: { type: 'number' },
                                        total: { type: 'number' },
                                        percentage: { type: 'number' },
                                    },
                                },
                            },
                        },
                    },
                },
            }, function (_request, _reply) { return __awaiter(_this, void 0, void 0, function () {
                var metrics, memoryCheck;
                return __generator(this, function (_a) {
                    metrics = metricsStore.getMetrics();
                    memoryCheck = checkMemory();
                    logger_js_1.healthLogger.debug({ metrics: metrics }, 'Metrics requested');
                    return [2 /*return*/, __assign(__assign({ timestamp: new Date().toISOString() }, metrics), { memory: memoryCheck.usage })];
                });
            }); });
            // Metrics reset endpoint (for testing/development)
            fastify.post('/health/metrics/reset', {
                schema: {
                    description: 'Reset application metrics (development only)',
                    tags: ['Health'],
                    response: {
                        200: {
                            type: 'object',
                            properties: {
                                message: { type: 'string' },
                                timestamp: { type: 'string' },
                            },
                        },
                    },
                },
            }, function (request, reply) { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    if (process.env.NODE_ENV === 'production') {
                        reply.code(403);
                        return [2 /*return*/, {
                                error: 'Forbidden',
                                message: 'Metrics reset not allowed in production',
                            }];
                    }
                    metricsStore.reset();
                    logger_js_1.healthLogger.info({
                        ip: request.ip,
                        userAgent: request.headers['user-agent'],
                    }, 'Metrics reset requested');
                    return [2 /*return*/, {
                            message: 'Metrics reset successfully',
                            timestamp: new Date().toISOString(),
                        }];
                });
            }); });
            // Cleanup on close
            fastify.addHook('onClose', function () { return __awaiter(_this, void 0, void 0, function () {
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0: return [4 /*yield*/, prisma.$disconnect()];
                        case 1:
                            _a.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            return [2 /*return*/];
        });
    });
}
var templateObject_1;
