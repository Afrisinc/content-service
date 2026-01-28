"use strict";
/**
 * Social Media Helper Functions
 * Provides utility functions for social media posting and platform integration
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.socialMediaHelper = void 0;
var socialMedia_types_1 = require("@/types/socialMedia.types");
var axios_1 = require("axios");
var logger_1 = require("@/utils/logger");
var SocialMediaHelper = /** @class */ (function () {
    function SocialMediaHelper() {
        this.FACEBOOK_API_VERSION = 'v24.0';
        this.FACEBOOK_GRAPH_API_URL = 'https://graph.facebook.com';
        this.httpClient = axios_1.default.create({
            timeout: 30000,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });
    }
    /**
     * Transform generic social media payload to platform-specific payload
     */
    SocialMediaHelper.prototype.transformPayload = function (payload) {
        var _a;
        var facebookPayload = {
            access_token: payload.accessToken,
            message: payload.content.message,
            link: payload.content.link,
            description: payload.content.description,
            picture: payload.content.picture,
            name: payload.content.name,
            caption: payload.content.caption,
        };
        // Add tags if present
        if (payload.content.tags && payload.content.tags.length > 0) {
            facebookPayload.story = payload.content.tags.join(' ');
        }
        // Add media information
        if (payload.media) {
            if (payload.media.type === 'image' && payload.media.url) {
                facebookPayload.picture = payload.media.url;
            }
            else if (payload.media.type === 'video' && payload.media.url) {
                facebookPayload.source = payload.media.url;
            }
        }
        // Add scheduling
        if ((_a = payload.scheduling) === null || _a === void 0 ? void 0 : _a.scheduled_publish_time) {
            facebookPayload.scheduled_publish_time = payload.scheduling.scheduled_publish_time;
        }
        // Add targeting if present
        if (payload.targeting) {
            facebookPayload.targeting = payload.targeting;
        }
        return facebookPayload;
    };
    /**
     * Build Facebook Graph API URL for posting
     */
    SocialMediaHelper.prototype.buildFacebookApiUrl = function (pageId) {
        return "".concat(this.FACEBOOK_GRAPH_API_URL, "/").concat(this.FACEBOOK_API_VERSION, "/").concat(pageId, "/feed");
    };
    /**
     * Convert payload to URL-encoded form data
     */
    SocialMediaHelper.prototype.payloadToFormData = function (payload) {
        var params = new URLSearchParams();
        for (var _i = 0, _a = Object.entries(payload); _i < _a.length; _i++) {
            var _b = _a[_i], key = _b[0], value = _b[1];
            if (value !== undefined && value !== null) {
                if (typeof value === 'object') {
                    params.append(key, JSON.stringify(value));
                }
                else {
                    params.append(key, String(value));
                }
            }
        }
        return params.toString();
    };
    /**
     * Validate payload has required fields
     */
    SocialMediaHelper.prototype.validatePayload = function (payload) {
        var errors = [];
        if (!payload.pageId) {
            errors.push('pageId is required');
        }
        if (!payload.accessToken) {
            errors.push('accessToken is required');
        }
        if (!payload.content) {
            errors.push('content object is required');
        }
        else {
            var _a = payload.content, message = _a.message, link = _a.link, picture = _a.picture;
            if (!message && !link && !picture) {
                errors.push('At least one of message, link, or picture must be provided');
            }
        }
        if (payload.platform !== socialMedia_types_1.SocialMediaPlatform.FACEBOOK) {
            // Currently only Facebook is fully implemented
            // Other platforms can be added later
            errors.push("Platform ".concat(payload.platform, " is not yet supported"));
        }
        return {
            valid: errors.length === 0,
            errors: errors,
        };
    };
    /**
     * Parse Facebook API response
     */
    SocialMediaHelper.prototype.parseFacebookResponse = function (response) {
        return {
            platform: socialMedia_types_1.SocialMediaPlatform.FACEBOOK,
            postId: response.data.id || '',
            status: 'success',
            message: 'Post published successfully',
            publishedAt: new Date().toISOString(),
            metadata: response.data,
        };
    };
    /**
     * Build error result
     */
    SocialMediaHelper.prototype.buildErrorResult = function (platform, error) {
        var _a, _b, _c, _d, _e, _f, _g;
        var errorMessage = ((_c = (_b = (_a = error.response) === null || _a === void 0 ? void 0 : _a.data) === null || _b === void 0 ? void 0 : _b.error) === null || _c === void 0 ? void 0 : _c.message) || error.message || 'Unknown error occurred';
        var errorCode = ((_f = (_e = (_d = error.response) === null || _d === void 0 ? void 0 : _d.data) === null || _e === void 0 ? void 0 : _e.error) === null || _f === void 0 ? void 0 : _f.code) || ((_g = error.response) === null || _g === void 0 ? void 0 : _g.status);
        return {
            platform: platform,
            postId: '',
            status: 'failed',
            message: 'Failed to publish post',
            error: "".concat(errorMessage).concat(errorCode ? " (Error Code: ".concat(errorCode, ")") : ''),
        };
    };
    /**
     * Validate access token format
     */
    SocialMediaHelper.prototype.isValidAccessToken = function (token) {
        return token.length > 0 && /^[a-zA-Z0-9_-]+$/.test(token);
    };
    /**
     * Validate page ID format
     */
    SocialMediaHelper.prototype.isValidPageId = function (pageId) {
        return /^\d+$/.test(pageId);
    };
    /**
     * Build metadata for AI-generated content
     */
    SocialMediaHelper.prototype.buildAIMetadata = function (aiConfig) {
        if (!(aiConfig === null || aiConfig === void 0 ? void 0 : aiConfig.enabled)) {
            return null;
        }
        return {
            aiGenerated: true,
            generatedBy: aiConfig.provider || 'unknown',
            model: aiConfig.model,
            generationPrompt: aiConfig.prompt,
            timestamp: new Date().toISOString(),
        };
    };
    /**
     * Estimate content character count for platform limits
     */
    SocialMediaHelper.prototype.estimateContentLength = function (content) {
        var length = 0;
        if (content.message) {
            length += content.message.length;
        }
        if (content.caption) {
            length += content.caption.length;
        }
        if (content.description) {
            length += content.description.length;
        }
        return length;
    };
    /**
     * Check if content exceeds platform limits
     */
    SocialMediaHelper.prototype.checkContentLimits = function (content, platform) {
        var warnings = [];
        var length = this.estimateContentLength(content);
        switch (platform) {
            case socialMedia_types_1.SocialMediaPlatform.FACEBOOK:
                if (content.message && content.message.length > 63206) {
                    warnings.push("Message exceeds Facebook limit of 63206 characters");
                }
                if (content.description && content.description.length > 4000) {
                    warnings.push("Description exceeds Facebook limit of 4000 characters");
                }
                break;
            case socialMedia_types_1.SocialMediaPlatform.TWITTER:
                if (length > 280) {
                    warnings.push("Content exceeds Twitter limit of 280 characters");
                }
                break;
            case socialMedia_types_1.SocialMediaPlatform.INSTAGRAM:
                if (content.caption && content.caption.length > 2200) {
                    warnings.push("Caption exceeds Instagram limit of 2200 characters");
                }
                break;
        }
        return {
            valid: warnings.length === 0,
            warnings: warnings,
        };
    };
    /**
     * Sanitize content to prevent issues
     */
    SocialMediaHelper.prototype.sanitizeContent = function (content) {
        var _a, _b, _c, _d;
        return __assign(__assign({}, content), { message: (_a = content.message) === null || _a === void 0 ? void 0 : _a.trim(), description: (_b = content.description) === null || _b === void 0 ? void 0 : _b.trim(), caption: (_c = content.caption) === null || _c === void 0 ? void 0 : _c.trim(), name: (_d = content.name) === null || _d === void 0 ? void 0 : _d.trim() });
    };
    /**
     * Get platform-specific API endpoint
     */
    SocialMediaHelper.prototype.getApiEndpoint = function (platform, pageId) {
        switch (platform) {
            case socialMedia_types_1.SocialMediaPlatform.FACEBOOK:
                return this.buildFacebookApiUrl(pageId);
            case socialMedia_types_1.SocialMediaPlatform.INSTAGRAM:
                // Instagram API endpoint would be different
                return "".concat(this.FACEBOOK_GRAPH_API_URL, "/").concat(this.FACEBOOK_API_VERSION, "/").concat(pageId, "/ig_hashtag_search");
            case socialMedia_types_1.SocialMediaPlatform.TWITTER:
                // Twitter API endpoints
                return 'https://api.twitter.com/2/tweets';
            case socialMedia_types_1.SocialMediaPlatform.LINKEDIN:
                // LinkedIn API endpoints
                return 'https://api.linkedin.com/v2/ugcPosts';
            case socialMedia_types_1.SocialMediaPlatform.TIKTOK:
                // TikTok API endpoints
                return 'https://open.tiktok.com/v1/post/publish/';
            default:
                throw new Error("Unsupported platform: ".concat(platform));
        }
    };
    /**
     * Log post attempt for debugging
     */
    SocialMediaHelper.prototype.logPostAttempt = function (platform, pageId, contentLength) {
        logger_1.logger.info({
            platform: platform,
            pageId: pageId,
            contentLength: contentLength,
        }, 'Attempting to post to social media');
    };
    /**
     * Log post success
     */
    SocialMediaHelper.prototype.logPostSuccess = function (platform, postId, pageId) {
        logger_1.logger.info({
            platform: platform,
            postId: postId,
            pageId: pageId,
        }, 'Successfully posted to social media');
    };
    /**
     * Log post failure
     */
    SocialMediaHelper.prototype.logPostFailure = function (platform, pageId, error) {
        logger_1.logger.error({
            platform: platform,
            pageId: pageId,
            error: error,
        }, 'Failed to post to social media');
    };
    return SocialMediaHelper;
}());
exports.socialMediaHelper = new SocialMediaHelper();
