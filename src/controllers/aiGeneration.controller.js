"use strict";
/**
 * AI Generation Controller
 * Handles HTTP requests for AI content generation
 */
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
exports.generatePost = generatePost;
exports.generatePostForPlatform = generatePostForPlatform;
exports.publishScheduledPosts = publishScheduledPosts;
exports.getGenerationHistory = getGenerationHistory;
var aiGeneration_service_1 = require("@/services/aiGeneration.service");
var aiAgent_service_1 = require("@/services/aiAgent.service");
var logger_1 = require("@/utils/logger");
/**
 * Generate posts from prompt using external AI Agent service
 */
function generatePost(request, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var body, aiAgentRequest, result, error_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    body = request.body;
                    // Validate required fields
                    if (!body.topic) {
                        return [2 /*return*/, reply.status(400).send({
                                success: false,
                                message: 'Topic is required',
                                error: 'Missing required field: topic',
                            })];
                    }
                    aiAgentRequest = {
                        topic: body.topic,
                        keywords: body.keywords,
                        link: body.link,
                        submittedAt: body.submittedAt || new Date().toISOString(),
                        formMode: body.formMode || 'production',
                    };
                    logger_1.logger.info({
                        topic: aiAgentRequest.topic,
                        formMode: aiAgentRequest.formMode,
                    }, 'Generating post with external AI Agent');
                    return [4 /*yield*/, aiAgent_service_1.aiAgentService.generatePost(aiAgentRequest)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, reply.status(201).send(result)];
                case 2:
                    error_1 = _a.sent();
                    logger_1.logger.error({
                        error: error_1 instanceof Error ? error_1.message : String(error_1),
                        stack: error_1 instanceof Error ? error_1.stack : undefined,
                    }, 'Error in generatePost controller');
                    return [2 /*return*/, reply.status(500).send({
                            success: false,
                            message: 'Failed to generate post',
                            error: error_1 instanceof Error ? error_1.message : 'Unknown error',
                        })];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Generate post for specific platform
 */
function generatePostForPlatform(request, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var body, platform, content, error_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    body = request.body;
                    if (!body.prompt) {
                        return [2 /*return*/, reply.status(400).send({
                                success: false,
                                message: 'Prompt is required',
                                error: 'Missing required field: prompt',
                            })];
                    }
                    if (!body.platforms || body.platforms.length === 0) {
                        return [2 /*return*/, reply.status(400).send({
                                success: false,
                                message: 'Platform is required',
                                error: 'Missing required field: platforms',
                            })];
                    }
                    platform = body.platforms[0];
                    logger_1.logger.info({
                        platform: platform,
                    }, 'Generating platform-specific content');
                    return [4 /*yield*/, aiGeneration_service_1.aiGenerationService.generatePostForPlatform(body.prompt, platform, {
                            tone: body.tone || 'professional',
                            maxLength: body.maxLength,
                            includeEmojis: body.includeEmojis,
                            includeHashtags: body.includeHashtags,
                        })];
                case 1:
                    content = _a.sent();
                    return [2 /*return*/, reply.status(200).send({
                            success: true,
                            message: "Content generated for ".concat(platform),
                            data: {
                                content: content,
                                platform: platform,
                            },
                        })];
                case 2:
                    error_2 = _a.sent();
                    logger_1.logger.error({
                        error: error_2 instanceof Error ? error_2.message : String(error_2),
                    }, 'Error generating platform-specific content');
                    return [2 /*return*/, reply.status(500).send({
                            success: false,
                            message: 'Failed to generate content',
                            error: error_2 instanceof Error ? error_2.message : 'Unknown error',
                        })];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Publish all scheduled posts due for publication
 */
function publishScheduledPosts(_request, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var result, error_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    logger_1.logger.info({}, 'Publishing scheduled posts');
                    return [4 /*yield*/, aiGeneration_service_1.aiGenerationService.publishScheduledPosts()];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, reply.status(200).send({
                            success: true,
                            message: "Published ".concat(result.published, " posts, ").concat(result.failed, " failed"),
                            data: result,
                        })];
                case 2:
                    error_3 = _a.sent();
                    logger_1.logger.error({
                        error: error_3 instanceof Error ? error_3.message : String(error_3),
                    }, 'Error publishing scheduled posts');
                    return [2 /*return*/, reply.status(500).send({
                            success: false,
                            message: 'Failed to publish scheduled posts',
                            error: error_3 instanceof Error ? error_3.message : 'Unknown error',
                        })];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * Get user's AI generation history
 */
function getGenerationHistory(request, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, query, limit, offset, result, error_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    userId = (_a = request.user) === null || _a === void 0 ? void 0 : _a.userId;
                    if (!userId) {
                        return [2 /*return*/, reply.status(401).send({
                                success: false,
                                message: 'User not authenticated',
                                error: 'Authentication required',
                            })];
                    }
                    query = request.query;
                    limit = Math.min(parseInt(query.limit || '10'), 100);
                    offset = parseInt(query.offset || '0');
                    logger_1.logger.info({
                        userId: userId,
                        limit: limit,
                        offset: offset,
                    }, 'Fetching generation history');
                    return [4 /*yield*/, aiGeneration_service_1.aiGenerationService.getUserGenerationHistory(userId, limit, offset)];
                case 1:
                    result = _b.sent();
                    return [2 /*return*/, reply.status(200).send(result)];
                case 2:
                    error_4 = _b.sent();
                    logger_1.logger.error({
                        error: error_4 instanceof Error ? error_4.message : String(error_4),
                    }, 'Error fetching generation history');
                    return [2 /*return*/, reply.status(500).send({
                            success: false,
                            message: 'Failed to fetch generation history',
                            error: error_4 instanceof Error ? error_4.message : 'Unknown error',
                        })];
                case 3: return [2 /*return*/];
            }
        });
    });
}
