"use strict";
/**
 * Social Media Controller
 * Handles HTTP requests for social media operations
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
exports.postToSocialMedia = postToSocialMedia;
exports.getSocialMediaPost = getSocialMediaPost;
exports.deleteSocialMediaPost = deleteSocialMediaPost;
exports.batchPostToSocialMedia = batchPostToSocialMedia;
exports.validateSocialMediaPayload = validateSocialMediaPayload;
exports.getAllSocialMediaPosts = getAllSocialMediaPosts;
exports.getUserSocialMediaPosts = getUserSocialMediaPosts;
var socialMedia_service_1 = require("../services/socialMedia.service");
var response_1 = require("../utils/response");
var service = new socialMedia_service_1.SocialMediaService();
/**
 * POST /social-media/post
 * Create a new social media post
 */
function postToSocialMedia(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var payload, userId, result, err_1;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    payload = req.body;
                    userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    return [4 /*yield*/, service.postToSocialMedia(payload, userId)];
                case 1:
                    result = _b.sent();
                    if (result.status === 'failed') {
                        return [2 /*return*/, (0, response_1.error)(reply, 400, result.error || 'Failed to post to social media')];
                    }
                    return [2 /*return*/, (0, response_1.success)(reply, 201, 'Post published successfully', result)];
                case 2:
                    err_1 = _b.sent();
                    return [2 /*return*/, (0, response_1.error)(reply, 400, err_1.message || 'Error posting to social media')];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * GET /social-media/posts/:postId
 * Get details of a social media post
 */
function getSocialMediaPost(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var postId, accessToken, result, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    postId = req.params.postId;
                    accessToken = req.query.accessToken;
                    if (!accessToken) {
                        return [2 /*return*/, (0, response_1.error)(reply, 400, 'Access token is required')];
                    }
                    return [4 /*yield*/, service.getPostDetails(postId, accessToken)];
                case 1:
                    result = _a.sent();
                    return [2 /*return*/, (0, response_1.success)(reply, 200, 'Post retrieved successfully', result)];
                case 2:
                    err_2 = _a.sent();
                    return [2 /*return*/, (0, response_1.error)(reply, 400, err_2.message || 'Error retrieving post')];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * DELETE /social-media/posts/:postId
 * Delete a social media post
 */
function deleteSocialMediaPost(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var postId, _a, accessToken, platform, err_3;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    postId = req.params.postId;
                    _a = req.query, accessToken = _a.accessToken, platform = _a.platform;
                    if (!accessToken) {
                        return [2 /*return*/, (0, response_1.error)(reply, 400, 'Access token is required')];
                    }
                    if (!platform) {
                        return [2 /*return*/, (0, response_1.error)(reply, 400, 'Platform is required')];
                    }
                    return [4 /*yield*/, service.deletePost(postId, accessToken, platform)];
                case 1:
                    _b.sent();
                    return [2 /*return*/, (0, response_1.success)(reply, 200, 'Post deleted successfully')];
                case 2:
                    err_3 = _b.sent();
                    return [2 /*return*/, (0, response_1.error)(reply, 400, err_3.message || 'Error deleting post')];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * POST /social-media/batch
 * Post to multiple platforms at once
 */
function batchPostToSocialMedia(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var payloads, userId, results, successCount, failureCount, err_4;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 2, , 3]);
                    payloads = req.body;
                    userId = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
                    if (!Array.isArray(payloads) || payloads.length === 0) {
                        return [2 /*return*/, (0, response_1.error)(reply, 400, 'Payload must be an array of social media post requests')];
                    }
                    return [4 /*yield*/, service.batchPostToSocialMedia(payloads, userId)];
                case 1:
                    results = _b.sent();
                    successCount = results.filter(function (r) { return r.status === 'success'; }).length;
                    failureCount = results.filter(function (r) { return r.status === 'failed'; }).length;
                    return [2 /*return*/, (0, response_1.success)(reply, 201, "Batch posting completed (".concat(successCount, " success, ").concat(failureCount, " failed)"), {
                            results: results,
                            summary: {
                                total: results.length,
                                success: successCount,
                                failed: failureCount,
                            },
                        })];
                case 2:
                    err_4 = _b.sent();
                    return [2 /*return*/, (0, response_1.error)(reply, 400, err_4.message || 'Error in batch posting')];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * POST /social-media/validate-payload
 * Validate social media payload without posting
 */
function validateSocialMediaPayload(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var payload;
        return __generator(this, function (_a) {
            try {
                payload = req.body;
                // This can be extended to validate content with AI generation preview
                // or check for content policy violations
                return [2 /*return*/, (0, response_1.success)(reply, 200, 'Payload is valid', {
                        valid: true,
                        payload: payload,
                    })];
            }
            catch (err) {
                return [2 /*return*/, (0, response_1.error)(reply, 400, err.message || 'Invalid payload')];
            }
            return [2 /*return*/];
        });
    });
}
/**
 * GET /social-media/posts
 * Get all social media posts
 */
function getAllSocialMediaPosts(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var _a, platform, status_1, _b, limit, _c, offset, result, err_5;
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    _d.trys.push([0, 2, , 3]);
                    _a = req.query, platform = _a.platform, status_1 = _a.status, _b = _a.limit, limit = _b === void 0 ? 20 : _b, _c = _a.offset, offset = _c === void 0 ? 0 : _c;
                    return [4 /*yield*/, service.getAllPosts({
                            platform: platform,
                            status: status_1,
                            limit: Math.min(Number(limit), 100),
                            offset: Number(offset),
                        })];
                case 1:
                    result = _d.sent();
                    return [2 /*return*/, (0, response_1.success)(reply, 200, 'Posts retrieved successfully', result)];
                case 2:
                    err_5 = _d.sent();
                    return [2 /*return*/, (0, response_1.error)(reply, 400, err_5.message || 'Error retrieving posts')];
                case 3: return [2 /*return*/];
            }
        });
    });
}
/**
 * GET /social-media/user/posts
 * Get posts by logged-in user
 */
function getUserSocialMediaPosts(req, reply) {
    return __awaiter(this, void 0, void 0, function () {
        var userId, _a, platform, status_2, _b, limit, _c, offset, result, err_6;
        var _d;
        return __generator(this, function (_e) {
            switch (_e.label) {
                case 0:
                    _e.trys.push([0, 2, , 3]);
                    userId = (_d = req.user) === null || _d === void 0 ? void 0 : _d.userId;
                    if (!userId) {
                        return [2 /*return*/, (0, response_1.error)(reply, 401, 'User authentication required')];
                    }
                    _a = req.query, platform = _a.platform, status_2 = _a.status, _b = _a.limit, limit = _b === void 0 ? 20 : _b, _c = _a.offset, offset = _c === void 0 ? 0 : _c;
                    return [4 /*yield*/, service.getUserPosts(userId, {
                            platform: platform,
                            status: status_2,
                            limit: Math.min(Number(limit), 100),
                            offset: Number(offset),
                        })];
                case 1:
                    result = _e.sent();
                    return [2 /*return*/, (0, response_1.success)(reply, 200, 'User posts retrieved successfully', result)];
                case 2:
                    err_6 = _e.sent();
                    return [2 /*return*/, (0, response_1.error)(reply, 400, err_6.message || 'Error retrieving user posts')];
                case 3: return [2 /*return*/];
            }
        });
    });
}
