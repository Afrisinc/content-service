"use strict";
/**
 * Social Media Service
 * Handles business logic for social media posting operations
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
exports.socialMediaService = exports.SocialMediaService = void 0;
var socialMedia_types_1 = require("@/types/socialMedia.types");
var socialMedia_helper_1 = require("@/helpers/socialMedia.helper");
var socialMediaPost_repository_1 = require("@/repositories/socialMediaPost.repository");
var logger_1 = require("@/utils/logger");
var SocialMediaService = /** @class */ (function () {
    function SocialMediaService() {
    }
    /**
     * Post content to social media platform and save to database
     */
    SocialMediaService.prototype.postToSocialMedia = function (payload, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var dbPostId, validation, sanitizedContent, sanitizedPayload, contentCheck, dbPost, contentLength, result, _a, error_1, platform, pageId, errorMessage;
            var _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t;
            return __generator(this, function (_u) {
                switch (_u.label) {
                    case 0:
                        _u.trys.push([0, 17, , 20]);
                        validation = socialMedia_helper_1.socialMediaHelper.validatePayload(payload);
                        if (!validation.valid) {
                            throw new Error("Validation failed: ".concat(validation.errors.join(', ')));
                        }
                        // Additional format validation
                        if (!socialMedia_helper_1.socialMediaHelper.isValidAccessToken(payload.accessToken)) {
                            throw new Error('Invalid access token format');
                        }
                        if (!socialMedia_helper_1.socialMediaHelper.isValidPageId(payload.pageId)) {
                            throw new Error('Invalid page ID format');
                        }
                        sanitizedContent = socialMedia_helper_1.socialMediaHelper.sanitizeContent(payload.content);
                        sanitizedPayload = __assign(__assign({}, payload), { content: sanitizedContent });
                        contentCheck = socialMedia_helper_1.socialMediaHelper.checkContentLimits(sanitizedPayload.content, payload.platform);
                        if (!contentCheck.valid) {
                            logger_1.logger.warn({
                                warnings: contentCheck.warnings,
                                platform: payload.platform,
                            }, 'Content limit warnings');
                        }
                        if (!userId) return [3 /*break*/, 2];
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.createPost({
                                userId: userId,
                                platform: payload.platform,
                                pageId: payload.pageId,
                                message: sanitizedPayload.content.message,
                                link: sanitizedPayload.content.link,
                                description: sanitizedPayload.content.description,
                                picture: sanitizedPayload.content.picture,
                                name: sanitizedPayload.content.name,
                                caption: sanitizedPayload.content.caption,
                                tags: sanitizedPayload.content.tags,
                                mediaType: (_b = sanitizedPayload.media) === null || _b === void 0 ? void 0 : _b.type,
                                mediaUrls: ((_c = sanitizedPayload.media) === null || _c === void 0 ? void 0 : _c.urls) || (((_d = sanitizedPayload.media) === null || _d === void 0 ? void 0 : _d.url) ? [sanitizedPayload.media.url] : []),
                                altText: (_e = sanitizedPayload.media) === null || _e === void 0 ? void 0 : _e.alt_text,
                                scheduledAt: ((_f = sanitizedPayload.scheduling) === null || _f === void 0 ? void 0 : _f.scheduled_publish_time)
                                    ? new Date(sanitizedPayload.scheduling.scheduled_publish_time * 1000)
                                    : undefined,
                                ageMin: (_g = sanitizedPayload.targeting) === null || _g === void 0 ? void 0 : _g.age_min,
                                ageMax: (_h = sanitizedPayload.targeting) === null || _h === void 0 ? void 0 : _h.age_max,
                                genders: ((_j = sanitizedPayload.targeting) === null || _j === void 0 ? void 0 : _j.genders) || [],
                                countries: ((_k = sanitizedPayload.targeting) === null || _k === void 0 ? void 0 : _k.countries) || [],
                                regions: ((_l = sanitizedPayload.targeting) === null || _l === void 0 ? void 0 : _l.regions) || [],
                                cities: ((_m = sanitizedPayload.targeting) === null || _m === void 0 ? void 0 : _m.cities) || [],
                                interests: ((_o = sanitizedPayload.targeting) === null || _o === void 0 ? void 0 : _o.interests) || [],
                                keywords: ((_p = sanitizedPayload.targeting) === null || _p === void 0 ? void 0 : _p.keywords) || [],
                                aiGenerated: (_q = sanitizedPayload.metadata) === null || _q === void 0 ? void 0 : _q.aiGenerated,
                                aiProvider: (_r = sanitizedPayload.metadata) === null || _r === void 0 ? void 0 : _r.generatedBy,
                                aiPrompt: (_s = sanitizedPayload.metadata) === null || _s === void 0 ? void 0 : _s.generationPrompt,
                                status: 'pending',
                                metadata: sanitizedPayload.metadata ? JSON.stringify(sanitizedPayload.metadata) : undefined,
                            })];
                    case 1:
                        dbPost = _u.sent();
                        dbPostId = dbPost.id;
                        logger_1.logger.info({ dbPostId: dbPostId, platform: payload.platform }, 'Post saved to database');
                        _u.label = 2;
                    case 2:
                        contentLength = socialMedia_helper_1.socialMediaHelper.estimateContentLength(sanitizedPayload.content);
                        socialMedia_helper_1.socialMediaHelper.logPostAttempt(payload.platform, payload.pageId, contentLength);
                        result = void 0;
                        _a = payload.platform;
                        switch (_a) {
                            case socialMedia_types_1.SocialMediaPlatform.FACEBOOK: return [3 /*break*/, 3];
                            case socialMedia_types_1.SocialMediaPlatform.INSTAGRAM: return [3 /*break*/, 5];
                            case socialMedia_types_1.SocialMediaPlatform.TWITTER: return [3 /*break*/, 7];
                            case socialMedia_types_1.SocialMediaPlatform.LINKEDIN: return [3 /*break*/, 9];
                            case socialMedia_types_1.SocialMediaPlatform.TIKTOK: return [3 /*break*/, 11];
                        }
                        return [3 /*break*/, 13];
                    case 3: return [4 /*yield*/, this.postToFacebook(sanitizedPayload)];
                    case 4:
                        result = _u.sent();
                        return [3 /*break*/, 14];
                    case 5: return [4 /*yield*/, this.postToInstagram()];
                    case 6:
                        result = _u.sent();
                        return [3 /*break*/, 14];
                    case 7: return [4 /*yield*/, this.postToTwitter()];
                    case 8:
                        result = _u.sent();
                        return [3 /*break*/, 14];
                    case 9: return [4 /*yield*/, this.postToLinkedIn()];
                    case 10:
                        result = _u.sent();
                        return [3 /*break*/, 14];
                    case 11: return [4 /*yield*/, this.postToTikTok()];
                    case 12:
                        result = _u.sent();
                        return [3 /*break*/, 14];
                    case 13: throw new Error("Unsupported platform: ".concat(payload.platform));
                    case 14:
                        if (!(dbPostId && result.status === 'success')) return [3 /*break*/, 16];
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.updatePostAfterPublish(dbPostId, {
                                platformPostId: result.postId,
                                postUrl: (_t = result.metadata) === null || _t === void 0 ? void 0 : _t.permalink_url,
                                publishedAt: new Date(),
                                status: 'published',
                            })];
                    case 15:
                        _u.sent();
                        _u.label = 16;
                    case 16:
                        // Log success
                        socialMedia_helper_1.socialMediaHelper.logPostSuccess(payload.platform, result.postId, payload.pageId);
                        return [2 /*return*/, result];
                    case 17:
                        error_1 = _u.sent();
                        platform = (payload === null || payload === void 0 ? void 0 : payload.platform) || socialMedia_types_1.SocialMediaPlatform.FACEBOOK;
                        pageId = (payload === null || payload === void 0 ? void 0 : payload.pageId) || 'unknown';
                        errorMessage = error_1 instanceof Error ? error_1.message : String(error_1);
                        if (!dbPostId) return [3 /*break*/, 19];
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.markPostFailed(dbPostId, errorMessage)];
                    case 18:
                        _u.sent();
                        _u.label = 19;
                    case 19:
                        socialMedia_helper_1.socialMediaHelper.logPostFailure(platform, pageId, errorMessage);
                        return [2 /*return*/, socialMedia_helper_1.socialMediaHelper.buildErrorResult(platform, error_1)];
                    case 20: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Post to Facebook
     */
    SocialMediaService.prototype.postToFacebook = function (payload) {
        return __awaiter(this, void 0, void 0, function () {
            var facebookPayload, apiUrl, formData, response, responseData, result;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        facebookPayload = socialMedia_helper_1.socialMediaHelper.transformPayload(payload);
                        apiUrl = socialMedia_helper_1.socialMediaHelper.buildFacebookApiUrl(payload.pageId);
                        formData = socialMedia_helper_1.socialMediaHelper.payloadToFormData(facebookPayload);
                        return [4 /*yield*/, fetch(apiUrl, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/x-www-form-urlencoded',
                                },
                                body: formData,
                            })];
                    case 1:
                        response = _b.sent();
                        return [4 /*yield*/, response.json()];
                    case 2:
                        responseData = (_b.sent());
                        if (!response.ok) {
                            throw new Error(((_a = responseData.error) === null || _a === void 0 ? void 0 : _a.message) || "Facebook API error: ".concat(response.status));
                        }
                        result = socialMedia_helper_1.socialMediaHelper.parseFacebookResponse({
                            data: responseData,
                        });
                        // Add metadata if present
                        if (payload.metadata) {
                            result.metadata = __assign(__assign({}, result.metadata), payload.metadata);
                        }
                        return [2 /*return*/, result];
                }
            });
        });
    };
    /**
     * Post to Instagram (via Facebook Graph API)
     */
    SocialMediaService.prototype.postToInstagram = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Instagram uses Facebook Graph API but with different endpoints
                // This is a placeholder for Instagram implementation
                logger_1.logger.warn('Instagram posting is not yet fully implemented');
                return [2 /*return*/, {
                        platform: socialMedia_types_1.SocialMediaPlatform.INSTAGRAM,
                        postId: '',
                        status: 'pending',
                        message: 'Instagram posting will be available soon',
                    }];
            });
        });
    };
    /**
     * Post to Twitter
     */
    SocialMediaService.prototype.postToTwitter = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // This is a placeholder for Twitter implementation
                logger_1.logger.warn('Twitter posting is not yet implemented');
                return [2 /*return*/, {
                        platform: socialMedia_types_1.SocialMediaPlatform.TWITTER,
                        postId: '',
                        status: 'pending',
                        message: 'Twitter posting will be available soon',
                    }];
            });
        });
    };
    /**
     * Post to LinkedIn
     */
    SocialMediaService.prototype.postToLinkedIn = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // This is a placeholder for LinkedIn implementation
                logger_1.logger.warn('LinkedIn posting is not yet implemented');
                return [2 /*return*/, {
                        platform: socialMedia_types_1.SocialMediaPlatform.LINKEDIN,
                        postId: '',
                        status: 'pending',
                        message: 'LinkedIn posting will be available soon',
                    }];
            });
        });
    };
    /**
     * Post to TikTok
     */
    SocialMediaService.prototype.postToTikTok = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // This is a placeholder for TikTok implementation
                logger_1.logger.warn('TikTok posting is not yet implemented');
                return [2 /*return*/, {
                        platform: socialMedia_types_1.SocialMediaPlatform.TIKTOK,
                        postId: '',
                        status: 'pending',
                        message: 'TikTok posting will be available soon',
                    }];
            });
        });
    };
    /**
     * Get post details from Facebook
     */
    SocialMediaService.prototype.getPostDetails = function (postId, accessToken) {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, data, error_2;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 3, , 4]);
                        url = "https://graph.facebook.com/v24.0/".concat(postId, "?access_token=").concat(accessToken, "&fields=id,message,story,picture,link,name,description,type,status_type,permalink_url,shares,likes.summary(true).limit(0),comments.summary(true).limit(0),created_time,updated_time");
                        return [4 /*yield*/, fetch(url, {
                                method: 'GET',
                            })];
                    case 1:
                        response = _b.sent();
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = (_b.sent());
                        if (!response.ok) {
                            throw new Error(((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || "Facebook API error: ".concat(response.status));
                        }
                        return [2 /*return*/, data];
                    case 3:
                        error_2 = _b.sent();
                        logger_1.logger.error({
                            postId: postId,
                            error: error_2 instanceof Error ? error_2.message : String(error_2),
                        }, 'Failed to get post details');
                        throw error_2;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Delete post from social media and database
     */
    SocialMediaService.prototype.deletePost = function (postId, accessToken, platform, dbPostId) {
        return __awaiter(this, void 0, void 0, function () {
            var url, response, data, error_3;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 6, , 7]);
                        if (platform !== socialMedia_types_1.SocialMediaPlatform.FACEBOOK) {
                            throw new Error("Delete not yet supported for ".concat(platform));
                        }
                        url = "https://graph.facebook.com/v24.0/".concat(postId, "?access_token=").concat(accessToken);
                        return [4 /*yield*/, fetch(url, {
                                method: 'DELETE',
                            })];
                    case 1:
                        response = _b.sent();
                        if (!!response.ok) return [3 /*break*/, 3];
                        return [4 /*yield*/, response.json()];
                    case 2:
                        data = (_b.sent());
                        throw new Error(((_a = data.error) === null || _a === void 0 ? void 0 : _a.message) || "Facebook API error: ".concat(response.status));
                    case 3:
                        if (!dbPostId) return [3 /*break*/, 5];
                        return [4 /*yield*/, socialMediaPost_repository_1.socialMediaPostRepository.deletePost(dbPostId)];
                    case 4:
                        _b.sent();
                        _b.label = 5;
                    case 5:
                        logger_1.logger.info({
                            postId: postId,
                            platform: platform,
                        }, 'Successfully deleted post');
                        return [2 /*return*/, true];
                    case 6:
                        error_3 = _b.sent();
                        logger_1.logger.error({
                            postId: postId,
                            platform: platform,
                            error: error_3 instanceof Error ? error_3.message : String(error_3),
                        }, 'Failed to delete post');
                        throw error_3;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Batch post to multiple platforms
     */
    SocialMediaService.prototype.batchPostToSocialMedia = function (payloads, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var promises, results, error_4;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        promises = payloads.map(function (payload) { return _this.postToSocialMedia(payload, userId); });
                        return [4 /*yield*/, Promise.allSettled(promises)];
                    case 1:
                        results = _a.sent();
                        return [2 /*return*/, results.map(function (result, index) {
                                if (result.status === 'fulfilled') {
                                    return result.value;
                                }
                                else {
                                    var payload = payloads[index];
                                    return socialMedia_helper_1.socialMediaHelper.buildErrorResult(payload.platform, result.reason);
                                }
                            })];
                    case 2:
                        error_4 = _a.sent();
                        logger_1.logger.error({
                            error: error_4 instanceof Error ? error_4.message : String(error_4),
                        }, 'Batch posting failed');
                        throw error_4;
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get all social media posts with optional filters
     */
    SocialMediaService.prototype.getAllPosts = function (filters) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, socialMediaPost_repository_1.socialMediaPostRepository.getAllPosts(filters)];
            });
        });
    };
    /**
     * Get user's post history
     */
    SocialMediaService.prototype.getUserPosts = function (userId, filters) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, socialMediaPost_repository_1.socialMediaPostRepository.getPostsByUser(userId, filters)];
            });
        });
    };
    /**
     * Get user's statistics
     */
    SocialMediaService.prototype.getUserStats = function (userId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, socialMediaPost_repository_1.socialMediaPostRepository.getUserPostStats(userId)];
            });
        });
    };
    return SocialMediaService;
}());
exports.SocialMediaService = SocialMediaService;
exports.socialMediaService = new SocialMediaService();
