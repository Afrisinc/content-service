"use strict";
/**
 * Social Media Post Repository
 * Database operations for social media posts
 */
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
exports.socialMediaPostRepository = exports.SocialMediaPostRepository = void 0;
var prismaClient_1 = require("@/database/prismaClient");
var SocialMediaPostRepository = /** @class */ (function () {
    function SocialMediaPostRepository() {
        this.prisma = prismaClient_1.prisma;
    }
    /**
     * Create a new social media post record
     */
    SocialMediaPostRepository.prototype.createPost = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.create({
                        data: __assign(__assign({}, data), { status: data.status || 'pending' }),
                    })];
            });
        });
    };
    /**
     * Update post with platform-specific data after publishing
     */
    SocialMediaPostRepository.prototype.updatePostAfterPublish = function (postId, data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.update({
                        where: { id: postId },
                        data: {
                            postId: data.platformPostId,
                            postUrl: data.postUrl,
                            publishedAt: data.publishedAt,
                            status: data.status,
                            updatedAt: new Date(),
                        },
                    })];
            });
        });
    };
    /**
     * Update post status to failed with error message
     */
    SocialMediaPostRepository.prototype.markPostFailed = function (postId, errorMessage) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.update({
                        where: { id: postId },
                        data: {
                            status: 'failed',
                            errorMessage: errorMessage,
                            updatedAt: new Date(),
                        },
                    })];
            });
        });
    };
    /**
     * Get post by ID
     */
    SocialMediaPostRepository.prototype.getPostById = function (postId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findUnique({
                        where: { id: postId },
                        include: {
                            user: {
                                select: {
                                    id: true,
                                    email: true,
                                    name: true,
                                },
                            },
                        },
                    })];
            });
        });
    };
    /**
     * Get all posts with optional filters
     */
    SocialMediaPostRepository.prototype.getAllPosts = function (options) {
        return __awaiter(this, void 0, void 0, function () {
            var where, _a, posts, total;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        where = {};
                        if (options === null || options === void 0 ? void 0 : options.platform) {
                            where.platform = options.platform;
                        }
                        if (options === null || options === void 0 ? void 0 : options.status) {
                            where.status = options.status;
                        }
                        return [4 /*yield*/, Promise.all([
                                this.prisma.socialMediaPost.findMany({
                                    where: where,
                                    skip: (options === null || options === void 0 ? void 0 : options.offset) || 0,
                                    take: (options === null || options === void 0 ? void 0 : options.limit) || 50,
                                    orderBy: { createdAt: 'desc' },
                                    include: {
                                        user: {
                                            select: {
                                                id: true,
                                                email: true,
                                                name: true,
                                            },
                                        },
                                    },
                                }),
                                this.prisma.socialMediaPost.count({ where: where }),
                            ])];
                    case 1:
                        _a = _b.sent(), posts = _a[0], total = _a[1];
                        return [2 /*return*/, {
                                posts: posts,
                                total: total,
                                limit: (options === null || options === void 0 ? void 0 : options.limit) || 50,
                                offset: (options === null || options === void 0 ? void 0 : options.offset) || 0,
                            }];
                }
            });
        });
    };
    /**
     * Get all posts by user
     */
    SocialMediaPostRepository.prototype.getPostsByUser = function (userId, options) {
        return __awaiter(this, void 0, void 0, function () {
            var where, _a, posts, total;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        where = { userId: userId };
                        if (options === null || options === void 0 ? void 0 : options.platform) {
                            where.platform = options.platform;
                        }
                        if (options === null || options === void 0 ? void 0 : options.status) {
                            where.status = options.status;
                        }
                        return [4 /*yield*/, Promise.all([
                                this.prisma.socialMediaPost.findMany({
                                    where: where,
                                    skip: (options === null || options === void 0 ? void 0 : options.offset) || 0,
                                    take: (options === null || options === void 0 ? void 0 : options.limit) || 50,
                                    orderBy: { createdAt: 'desc' },
                                    include: {
                                        user: {
                                            select: {
                                                id: true,
                                                email: true,
                                                name: true,
                                            },
                                        },
                                    },
                                }),
                                this.prisma.socialMediaPost.count({ where: where }),
                            ])];
                    case 1:
                        _a = _b.sent(), posts = _a[0], total = _a[1];
                        return [2 /*return*/, {
                                posts: posts,
                                total: total,
                                limit: (options === null || options === void 0 ? void 0 : options.limit) || 50,
                                offset: (options === null || options === void 0 ? void 0 : options.offset) || 0,
                            }];
                }
            });
        });
    };
    /**
     * Get published posts by user
     */
    SocialMediaPostRepository.prototype.getPublishedPostsByUser = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit, offset) {
            if (limit === void 0) { limit = 50; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            userId: userId,
                            status: 'published',
                        },
                        skip: offset,
                        take: limit,
                        orderBy: { publishedAt: 'desc' },
                    })];
            });
        });
    };
    /**
     * Get AI-generated posts
     */
    SocialMediaPostRepository.prototype.getAIGeneratedPosts = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit, offset) {
            if (limit === void 0) { limit = 50; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            userId: userId,
                            aiGenerated: true,
                        },
                        skip: offset,
                        take: limit,
                        orderBy: { createdAt: 'desc' },
                    })];
            });
        });
    };
    /**
     * Get posts by platform
     */
    SocialMediaPostRepository.prototype.getPostsByPlatform = function (userId_1, platform_1) {
        return __awaiter(this, arguments, void 0, function (userId, platform, limit, offset) {
            if (limit === void 0) { limit = 50; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            userId: userId,
                            platform: platform,
                        },
                        skip: offset,
                        take: limit,
                        orderBy: { createdAt: 'desc' },
                    })];
            });
        });
    };
    /**
     * Get scheduled posts
     */
    SocialMediaPostRepository.prototype.getScheduledPosts = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            userId: userId,
                            status: 'pending',
                            scheduledAt: {
                                not: null,
                            },
                        },
                        orderBy: { scheduledAt: 'asc' },
                    })];
            });
        });
    };
    /**
     * Get posts ready to publish (scheduled time passed)
     */
    SocialMediaPostRepository.prototype.getPostsReadyToPublish = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            status: 'pending',
                            scheduledAt: {
                                lte: new Date(),
                            },
                        },
                        include: {
                            user: true,
                        },
                    })];
            });
        });
    };
    /**
     * Update post with engagement metrics
     */
    SocialMediaPostRepository.prototype.updatePostMetrics = function (postId, metrics) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.update({
                        where: { id: postId },
                        data: __assign(__assign({}, metrics), { lastMetricsUpdate: new Date(), updatedAt: new Date() }),
                    })];
            });
        });
    };
    /**
     * Get posts with low engagement
     */
    SocialMediaPostRepository.prototype.getPostsWithLowEngagement = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, minDaysOld) {
            var daysAgo;
            if (minDaysOld === void 0) { minDaysOld = 7; }
            return __generator(this, function (_a) {
                daysAgo = new Date();
                daysAgo.setDate(daysAgo.getDate() - minDaysOld);
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            userId: userId,
                            status: 'published',
                            publishedAt: {
                                lte: daysAgo,
                            },
                            likes: {
                                lt: 10,
                            },
                        },
                        orderBy: { publishedAt: 'desc' },
                    })];
            });
        });
    };
    /**
     * Get top performing posts
     */
    SocialMediaPostRepository.prototype.getTopPerformingPosts = function (userId_1) {
        return __awaiter(this, arguments, void 0, function (userId, limit) {
            if (limit === void 0) { limit = 10; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: { userId: userId, status: 'published' },
                        orderBy: [{ likes: 'desc' }, { comments: 'desc' }, { shares: 'desc' }],
                        take: limit,
                    })];
            });
        });
    };
    /**
     * Delete post (soft delete by marking as deleted)
     */
    SocialMediaPostRepository.prototype.deletePost = function (postId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.update({
                        where: { id: postId },
                        data: {
                            status: 'deleted',
                            updatedAt: new Date(),
                        },
                    })];
            });
        });
    };
    /**
     * Get analytics for post
     */
    SocialMediaPostRepository.prototype.getPostAnalytics = function (postId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaAnalytics.findUnique({
                        where: { postId: postId },
                    })];
            });
        });
    };
    /**
     * Create or update post analytics
     */
    SocialMediaPostRepository.prototype.upsertAnalytics = function (postId, data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaAnalytics.upsert({
                        where: { postId: postId },
                        update: __assign(__assign({}, data), { updatedAt: new Date() }),
                        create: __assign({ postId: postId }, data),
                    })];
            });
        });
    };
    /**
     * Get user's account configurations
     */
    SocialMediaPostRepository.prototype.getUserAccounts = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaAccount.findMany({
                        where: {
                            userId: userId,
                            isActive: true,
                        },
                    })];
            });
        });
    };
    /**
     * Get specific account configuration
     */
    SocialMediaPostRepository.prototype.getAccount = function (userId, platform, pageId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaAccount.findUnique({
                        where: {
                            userId_platform_pageId: {
                                userId: userId,
                                platform: platform,
                                pageId: pageId,
                            },
                        },
                    })];
            });
        });
    };
    /**
     * Create account configuration
     */
    SocialMediaPostRepository.prototype.createAccount = function (data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaAccount.create({
                        data: data,
                    })];
            });
        });
    };
    /**
     * Update account configuration
     */
    SocialMediaPostRepository.prototype.updateAccount = function (userId, platform, pageId, data) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaAccount.update({
                        where: {
                            userId_platform_pageId: {
                                userId: userId,
                                platform: platform,
                                pageId: pageId,
                            },
                        },
                        data: __assign(__assign({}, data), { updatedAt: new Date() }),
                    })];
            });
        });
    };
    /**
     * Get statistics for user's posts
     */
    SocialMediaPostRepository.prototype.getUserPostStats = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            var totalPosts, publishedPosts, failedPosts, aiGeneratedPosts, aggregates;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.prisma.socialMediaPost.count({
                            where: { userId: userId },
                        })];
                    case 1:
                        totalPosts = _a.sent();
                        return [4 /*yield*/, this.prisma.socialMediaPost.count({
                                where: { userId: userId, status: 'published' },
                            })];
                    case 2:
                        publishedPosts = _a.sent();
                        return [4 /*yield*/, this.prisma.socialMediaPost.count({
                                where: { userId: userId, status: 'failed' },
                            })];
                    case 3:
                        failedPosts = _a.sent();
                        return [4 /*yield*/, this.prisma.socialMediaPost.count({
                                where: { userId: userId, aiGenerated: true },
                            })];
                    case 4:
                        aiGeneratedPosts = _a.sent();
                        return [4 /*yield*/, this.prisma.socialMediaPost.aggregate({
                                where: { userId: userId, status: 'published' },
                                _sum: {
                                    likes: true,
                                    comments: true,
                                    shares: true,
                                    views: true,
                                },
                            })];
                    case 5:
                        aggregates = _a.sent();
                        return [2 /*return*/, {
                                totalPosts: totalPosts,
                                publishedPosts: publishedPosts,
                                failedPosts: failedPosts,
                                aiGeneratedPosts: aiGeneratedPosts,
                                totalEngagement: {
                                    likes: aggregates._sum.likes || 0,
                                    comments: aggregates._sum.comments || 0,
                                    shares: aggregates._sum.shares || 0,
                                    views: aggregates._sum.views || 0,
                                },
                            }];
                }
            });
        });
    };
    /**
     * Get posts by date range
     */
    SocialMediaPostRepository.prototype.getPostsByDateRange = function (userId_1, startDate_1, endDate_1) {
        return __awaiter(this, arguments, void 0, function (userId, startDate, endDate, limit, offset) {
            if (limit === void 0) { limit = 100; }
            if (offset === void 0) { offset = 0; }
            return __generator(this, function (_a) {
                return [2 /*return*/, this.prisma.socialMediaPost.findMany({
                        where: {
                            userId: userId,
                            createdAt: {
                                gte: startDate,
                                lte: endDate,
                            },
                        },
                        skip: offset,
                        take: limit,
                        orderBy: { createdAt: 'desc' },
                    })];
            });
        });
    };
    return SocialMediaPostRepository;
}());
exports.SocialMediaPostRepository = SocialMediaPostRepository;
exports.socialMediaPostRepository = new SocialMediaPostRepository();
