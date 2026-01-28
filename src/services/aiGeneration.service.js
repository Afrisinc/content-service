"use strict";
/**
 * AI Generation Service
 * Handles AI content generation and scheduling
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
exports.aiGenerationService = void 0;
var openai_helper_1 = require("@/helpers/openai.helper");
var socialMediaPost_repository_1 = require("@/repositories/socialMediaPost.repository");
var socialMedia_service_1 = require("./socialMedia.service");
var logger_1 = require("@/utils/logger");
var AIGenerationService = /** @class */ (function () {
    function AIGenerationService() {
    }
    /**
     * Generate posts from prompt and optionally schedule them
     */
    AIGenerationService.prototype.generateAndSchedulePosts = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var generatedImageUrl, imageCaption, captionError_1, error_1, error_2, generatedContent, platformContent, validPlatforms, _i, _a, platform, content, postIds, _b, validPlatforms_1, platform, post, error_3, error_4;
            var _c, _d;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _e.trys.push([0, 21, , 22]);
                        logger_1.logger.info({
                            platforms: request.platforms,
                            hasSchedule: !!request.scheduleFor,
                        }, 'Starting AI post generation');
                        generatedImageUrl = void 0;
                        imageCaption = void 0;
                        if (!request.includeImage) return [3 /*break*/, 9];
                        _e.label = 1;
                    case 1:
                        _e.trys.push([1, 7, , 8]);
                        logger_1.logger.info({
                            prompt: request.prompt.substring(0, 100),
                            style: request.imageStyle || 'default',
                        }, 'Generating image with DALL-E');
                        return [4 /*yield*/, openai_helper_1.openaiHelper.generateImage(request.prompt, request.imageStyle)];
                    case 2:
                        generatedImageUrl = _e.sent();
                        _e.label = 3;
                    case 3:
                        _e.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, openai_helper_1.openaiHelper.generateContentWithVision(generatedImageUrl, "Create a brief, engaging caption for this generated image that fits the following prompt: ".concat(request.prompt, ". Keep it concise and suitable for social media."))];
                    case 4:
                        imageCaption = _e.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        captionError_1 = _e.sent();
                        logger_1.logger.warn({
                            error: captionError_1 instanceof Error ? captionError_1.message : String(captionError_1),
                        }, 'Failed to generate image caption');
                        return [3 /*break*/, 6];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_1 = _e.sent();
                        logger_1.logger.warn({
                            prompt: request.prompt.substring(0, 100),
                            error: error_1 instanceof Error ? error_1.message : String(error_1),
                        }, 'Failed to generate image, proceeding with text-only content');
                        return [3 /*break*/, 8];
                    case 8: return [3 /*break*/, 13];
                    case 9:
                        if (!request.imageUrl) return [3 /*break*/, 13];
                        _e.label = 10;
                    case 10:
                        _e.trys.push([10, 12, , 13]);
                        return [4 /*yield*/, openai_helper_1.openaiHelper.generateContentWithVision(request.imageUrl, "Create a brief, engaging caption for this image that fits the following prompt: ".concat(request.prompt, ". Keep it concise and suitable for social media."))];
                    case 11:
                        imageCaption = _e.sent();
                        return [3 /*break*/, 13];
                    case 12:
                        error_2 = _e.sent();
                        logger_1.logger.warn({
                            imageUrl: request.imageUrl,
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        }, 'Failed to generate image caption, proceeding with text-only content');
                        return [3 /*break*/, 13];
                    case 13: return [4 /*yield*/, openai_helper_1.openaiHelper.generateContent({
                            prompt: request.prompt,
                            maxLength: request.maxLength || 500,
                            tone: request.tone || 'professional',
                            includeEmojis: (_c = request.includeEmojis) !== null && _c !== void 0 ? _c : true,
                            includeHashtags: (_d = request.includeHashtags) !== null && _d !== void 0 ? _d : true,
                            language: request.language || 'en',
                        })];
                    case 14:
                        generatedContent = _e.sent();
                        platformContent = {};
                        validPlatforms = [];
                        for (_i = 0, _a = request.platforms; _i < _a.length; _i++) {
                            platform = _a[_i];
                            content = generatedContent[platform];
                            if (content && typeof content === 'string') {
                                platformContent[platform] = content;
                                validPlatforms.push(platform);
                            }
                        }
                        if (validPlatforms.length === 0) {
                            return [2 /*return*/, {
                                    success: false,
                                    message: 'No content generated for requested platforms',
                                    error: 'Content generation failed for all platforms',
                                }];
                        }
                        postIds = [];
                        _b = 0, validPlatforms_1 = validPlatforms;
                        _e.label = 15;
                    case 15:
                        if (!(_b < validPlatforms_1.length)) return [3 /*break*/, 20];
                        platform = validPlatforms_1[_b];
                        _e.label = 16;
                    case 16:
                        _e.trys.push([16, 18, , 19]);
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.createPost({
                                userId: request.userId || '',
                                platform: platform,
                                pageId: 'scheduled', // Will be set when publishing
                                message: platformContent[platform],
                                tags: generatedContent.hashtags || [],
                                scheduledAt: request.scheduleFor || undefined,
                                aiGenerated: true,
                                aiProvider: 'openai',
                                aiModel: generatedContent.metadata.model,
                                aiPrompt: request.prompt,
                                metadata: JSON.stringify({
                                    generatedBy: 'openai',
                                    generationPrompt: request.prompt,
                                    generatedAt: new Date().toISOString(),
                                    tokensUsed: generatedContent.metadata.tokensUsed,
                                    originalTone: request.tone,
                                    includeEmojis: request.includeEmojis,
                                    includeHashtags: request.includeHashtags,
                                    imageUrl: generatedImageUrl || request.imageUrl,
                                    imageCaption: imageCaption,
                                    imageStyle: request.imageStyle,
                                }),
                            })];
                    case 17:
                        post = _e.sent();
                        postIds.push(post.id);
                        logger_1.logger.info({
                            postId: post.id,
                            platform: platform,
                            scheduled: !!request.scheduleFor,
                        }, 'Post created from AI generation');
                        return [3 /*break*/, 19];
                    case 18:
                        error_3 = _e.sent();
                        logger_1.logger.error({
                            platform: platform,
                            error: error_3 instanceof Error ? error_3.message : String(error_3),
                        }, 'Failed to create post record');
                        return [3 /*break*/, 19];
                    case 19:
                        _b++;
                        return [3 /*break*/, 15];
                    case 20: return [2 /*return*/, {
                            success: true,
                            message: "Successfully generated and ".concat(request.scheduleFor ? 'scheduled' : 'created', " posts for ").concat(validPlatforms.length, " platform(s)"),
                            data: {
                                postIds: postIds,
                                platforms: validPlatforms,
                                content: platformContent,
                                scheduledFor: request.scheduleFor || undefined,
                                hashtags: generatedContent.hashtags,
                                imageUrl: generatedImageUrl || request.imageUrl,
                                imageCaption: imageCaption,
                                metadata: generatedContent.metadata,
                            },
                        }];
                    case 21:
                        error_4 = _e.sent();
                        logger_1.logger.error({
                            prompt: request.prompt.substring(0, 100),
                            error: error_4 instanceof Error ? error_4.message : String(error_4),
                        }, 'AI post generation failed');
                        return [2 /*return*/, {
                                success: false,
                                message: 'Failed to generate posts',
                                error: error_4 instanceof Error ? error_4.message : 'Unknown error occurred',
                            }];
                    case 22: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate post for a specific platform
     */
    AIGenerationService.prototype.generatePostForPlatform = function (prompt, platform, options) {
        return __awaiter(this, void 0, void 0, function () {
            var content, error_5;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _c.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, openai_helper_1.openaiHelper.generateContentForPlatform({
                                prompt: prompt,
                                platform: platform,
                                maxLength: (options === null || options === void 0 ? void 0 : options.maxLength) || 500,
                                tone: (options === null || options === void 0 ? void 0 : options.tone) || 'professional',
                                includeEmojis: (_a = options === null || options === void 0 ? void 0 : options.includeEmojis) !== null && _a !== void 0 ? _a : true,
                                includeHashtags: (_b = options === null || options === void 0 ? void 0 : options.includeHashtags) !== null && _b !== void 0 ? _b : true,
                            })];
                    case 1:
                        content = _c.sent();
                        return [2 /*return*/, content];
                    case 2:
                        error_5 = _c.sent();
                        logger_1.logger.error({
                            platform: platform,
                            error: error_5 instanceof Error ? error_5.message : String(error_5),
                        }, 'Failed to generate platform-specific content');
                        throw error_5;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Publish scheduled posts that are due
     */
    AIGenerationService.prototype.publishScheduledPosts = function () {
        return __awaiter(this, void 0, void 0, function () {
            var postsToPublish, published, failed, errors, _i, postsToPublish_1, post, payload, result, postUrl, errorMsg, error_6, errorMsg, error_7;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 13, , 14]);
                        logger_1.logger.info({}, 'Checking for posts to publish');
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.getPostsReadyToPublish()];
                    case 1:
                        postsToPublish = _b.sent();
                        published = 0;
                        failed = 0;
                        errors = [];
                        _i = 0, postsToPublish_1 = postsToPublish;
                        _b.label = 2;
                    case 2:
                        if (!(_i < postsToPublish_1.length)) return [3 /*break*/, 12];
                        post = postsToPublish_1[_i];
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 9, , 11]);
                        payload = {
                            platform: post.platform,
                            pageId: post.pageId,
                            content: {
                                message: post.message || '',
                                link: post.link || undefined,
                                description: post.description || undefined,
                                picture: post.picture || undefined,
                                name: post.name || undefined,
                                caption: post.caption || undefined,
                            },
                            accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '',
                            metadata: post.metadata ? JSON.parse(post.metadata) : undefined,
                        };
                        return [4 /*yield*/, socialMedia_service_1.socialMediaService.postToSocialMedia(payload, post.userId)];
                    case 4:
                        result = _b.sent();
                        if (!(result.status === 'success' || result.status === 'pending')) return [3 /*break*/, 6];
                        postUrl = ((_a = result.metadata) === null || _a === void 0 ? void 0 : _a.postUrl) || "https://".concat(post.platform, ".com/").concat(result.postId);
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.updatePostAfterPublish(post.id, {
                                status: 'published',
                                platformPostId: result.postId || '',
                                postUrl: postUrl,
                                publishedAt: new Date(),
                            })];
                    case 5:
                        _b.sent();
                        published++;
                        logger_1.logger.info({
                            postId: post.id,
                            platform: post.platform,
                        }, 'Scheduled post published');
                        return [3 /*break*/, 8];
                    case 6:
                        failed++;
                        errorMsg = "Failed to publish ".concat(post.platform, " post: ").concat(result.message);
                        errors.push(errorMsg);
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.markPostFailed(post.id, errorMsg)];
                    case 7:
                        _b.sent();
                        logger_1.logger.error({
                            postId: post.id,
                            platform: post.platform,
                            error: result.message,
                        }, 'Failed to publish scheduled post');
                        _b.label = 8;
                    case 8: return [3 /*break*/, 11];
                    case 9:
                        error_6 = _b.sent();
                        failed++;
                        errorMsg = error_6 instanceof Error ? error_6.message : String(error_6);
                        errors.push(errorMsg);
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.markPostFailed(post.id, errorMsg)];
                    case 10:
                        _b.sent();
                        logger_1.logger.error({
                            postId: post.id,
                            error: errorMsg,
                        }, 'Error publishing scheduled post');
                        return [3 /*break*/, 11];
                    case 11:
                        _i++;
                        return [3 /*break*/, 2];
                    case 12: return [2 /*return*/, { published: published, failed: failed, errors: errors }];
                    case 13:
                        error_7 = _b.sent();
                        logger_1.logger.error({
                            error: error_7 instanceof Error ? error_7.message : String(error_7),
                        }, 'Scheduled post publishing check failed');
                        throw error_7;
                    case 14: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get generation history for user
     */
    AIGenerationService.prototype.getUserGenerationHistory = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit, offset) {
            var posts, error_8;
            if (limit === void 0) { limit = 10; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.getAIGeneratedPosts(userId, limit, offset)];
                    case 1:
                        posts = _a.sent();
                        return [2 /*return*/, {
                                success: true,
                                data: posts,
                                count: posts.length,
                            }];
                    case 2:
                        error_8 = _a.sent();
                        logger_1.logger.error({
                            userId: userId,
                            error: error_8 instanceof Error ? error_8.message : String(error_8),
                        }, 'Failed to fetch generation history');
                        throw error_8;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return AIGenerationService;
}());
exports.aiGenerationService = new AIGenerationService();
