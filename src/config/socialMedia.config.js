"use strict";
/**
 * Social Media Configuration
 * Centralized configuration for social media platforms and AI integration
 */
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimitConfig = exports.retryConfig = exports.platformContentLimits = exports.platformApiConfig = exports.socialMediaConfig = void 0;
exports.validateSocialMediaConfig = validateSocialMediaConfig;
exports.getPlatformConfig = getPlatformConfig;
exports.getPlatformApiConfig = getPlatformApiConfig;
exports.getPlatformLimits = getPlatformLimits;
exports.isPlatformEnabled = isPlatformEnabled;
exports.getEnabledPlatforms = getEnabledPlatforms;
var socialMedia_types_1 = require("@/types/socialMedia.types");
/**
 * Social Media Platform Configuration
 * Each platform can have different API versions, endpoints, and requirements
 */
exports.socialMediaConfig = {
    platforms: (_a = {},
        _a[socialMedia_types_1.SocialMediaPlatform.FACEBOOK] = {
            enabled: true,
            appId: process.env.FACEBOOK_APP_ID,
            appSecret: process.env.FACEBOOK_APP_SECRET,
            accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
            pageId: process.env.FACEBOOK_PAGE_ID,
        },
        _a[socialMedia_types_1.SocialMediaPlatform.INSTAGRAM] = {
            enabled: false, // Coming soon
            appId: process.env.INSTAGRAM_APP_ID,
            appSecret: process.env.INSTAGRAM_APP_SECRET,
            accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
            pageId: process.env.INSTAGRAM_PAGE_ID,
        },
        _a[socialMedia_types_1.SocialMediaPlatform.TWITTER] = {
            enabled: false, // Coming soon
            appId: process.env.TWITTER_API_KEY,
            appSecret: process.env.TWITTER_API_SECRET,
            accessToken: process.env.TWITTER_ACCESS_TOKEN,
        },
        _a[socialMedia_types_1.SocialMediaPlatform.LINKEDIN] = {
            enabled: false, // Coming soon
            appId: process.env.LINKEDIN_CLIENT_ID,
            appSecret: process.env.LINKEDIN_CLIENT_SECRET,
            accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
        },
        _a[socialMedia_types_1.SocialMediaPlatform.TIKTOK] = {
            enabled: false, // Coming soon
            appId: process.env.TIKTOK_CLIENT_KEY,
            appSecret: process.env.TIKTOK_CLIENT_SECRET,
            accessToken: process.env.TIKTOK_ACCESS_TOKEN,
        },
        _a),
    aiContent: {
        enabled: process.env.AI_CONTENT_GENERATION_ENABLED === 'true',
        provider: process.env.AI_PROVIDER || 'openai',
        model: process.env.AI_MODEL || 'gpt-4',
        maxLength: parseInt(process.env.AI_CONTENT_MAX_LENGTH || '500'),
        tone: process.env.AI_TONE || 'professional',
        includeEmojis: process.env.AI_INCLUDE_EMOJIS === 'true',
        includeHashtags: process.env.AI_INCLUDE_HASHTAGS === 'true',
        language: process.env.AI_LANGUAGE || 'en',
    },
};
/**
 * API Configuration for different social media platforms
 */
exports.platformApiConfig = {
    facebook: {
        apiVersion: 'v24.0',
        baseUrl: 'https://graph.facebook.com',
        endpoints: {
            feed: function (pageId) { return "/v24.0/".concat(pageId, "/feed"); },
            post: function (postId) { return "/v24.0/".concat(postId); },
            insights: function (pageId) { return "/v24.0/".concat(pageId, "/insights"); },
        },
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
    },
    instagram: {
        apiVersion: 'v24.0',
        baseUrl: 'https://graph.instagram.com',
        endpoints: {
            media: function (userId) { return "/v24.0/".concat(userId, "/media"); },
            caption: function (mediaId) { return "/v24.0/".concat(mediaId); },
            insights: function (mediaId) { return "/v24.0/".concat(mediaId, "/insights"); },
        },
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
    },
    twitter: {
        apiVersion: '2',
        baseUrl: 'https://api.twitter.com',
        endpoints: {
            tweets: function () { return '/2/tweets'; },
            retweets: function (tweetId) { return "/2/tweets/".concat(tweetId, "/retweeted_by"); },
        },
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
    },
    linkedin: {
        apiVersion: 'v2',
        baseUrl: 'https://api.linkedin.com',
        endpoints: {
            ugcPosts: function () { return '/v2/ugcPosts'; },
            organizations: function (orgId) { return "/v2/organizations/".concat(orgId); },
        },
        timeout: 30000,
        maxRetries: 3,
        retryDelay: 1000,
    },
    tiktok: {
        apiVersion: 'v1',
        baseUrl: 'https://open.tiktok.com',
        endpoints: {
            publish: function () { return '/v1/post/publish/'; },
            videos: function () { return '/v1/videos/search'; },
        },
        timeout: 60000,
        maxRetries: 3,
        retryDelay: 2000,
    },
};
/**
 * Content length limits for each platform
 */
exports.platformContentLimits = {
    facebook: {
        messageLimit: 63206,
        descriptionLimit: 4000,
        nameLimit: 100,
        captionLimit: 1000,
        tagLimit: 50,
    },
    instagram: {
        captionLimit: 2200,
        hashtagLimit: 30,
        mentionLimit: 30,
        videoMaxDuration: 3600, // seconds
    },
    twitter: {
        textLimit: 280,
        mediaLimit: 4,
    },
    linkedin: {
        textLimit: 3000,
        articleTitleLimit: 200,
        articleLimit: 100000,
    },
    tiktok: {
        captionLimit: 2200,
        hashtagLimit: 60,
        videoMaxDuration: 600, // seconds
    },
};
/**
 * Default retry configuration
 */
exports.retryConfig = {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 30000,
    backoffMultiplier: 2,
};
/**
 * Rate limiting configuration
 */
exports.rateLimitConfig = {
    facebook: {
        requestsPerSecond: 100,
        requestsPerDay: 200000,
    },
    instagram: {
        requestsPerSecond: 100,
        requestsPerDay: 200000,
    },
    twitter: {
        requestsPerSecond: 2,
        requestsPerDay: 300,
    },
    linkedin: {
        requestsPerSecond: 2,
        requestsPerDay: 1000,
    },
    tiktok: {
        requestsPerSecond: 1,
        requestsPerDay: 500,
    },
};
/**
 * Validate that required configuration is present
 */
function validateSocialMediaConfig() {
    var _a, _b;
    var errors = [];
    if ((_a = exports.socialMediaConfig.platforms[socialMedia_types_1.SocialMediaPlatform.FACEBOOK]) === null || _a === void 0 ? void 0 : _a.enabled) {
        if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
            errors.push('FACEBOOK_PAGE_ACCESS_TOKEN is required for Facebook integration');
        }
        if (!process.env.FACEBOOK_PAGE_ID) {
            errors.push('FACEBOOK_PAGE_ID is required for Facebook integration');
        }
    }
    if ((_b = exports.socialMediaConfig.aiContent) === null || _b === void 0 ? void 0 : _b.enabled) {
        if (!process.env.AI_API_KEY) {
            errors.push('AI_API_KEY is required for AI content generation');
        }
    }
    return {
        valid: errors.length === 0,
        errors: errors,
    };
}
/**
 * Get platform configuration
 */
function getPlatformConfig(platform) {
    return exports.socialMediaConfig.platforms[platform];
}
/**
 * Get platform API configuration
 */
function getPlatformApiConfig(platform) {
    return exports.platformApiConfig[platform.toLowerCase()];
}
/**
 * Get platform content limits
 */
function getPlatformLimits(platform) {
    return exports.platformContentLimits[platform.toLowerCase()];
}
/**
 * Check if platform is enabled
 */
function isPlatformEnabled(platform) {
    var _a, _b;
    return (_b = (_a = exports.socialMediaConfig.platforms[platform]) === null || _a === void 0 ? void 0 : _a.enabled) !== null && _b !== void 0 ? _b : false;
}
/**
 * Get enabled platforms
 */
function getEnabledPlatforms() {
    return Object.entries(exports.socialMediaConfig.platforms)
        .filter(function (_a) {
        var config = _a[1];
        return config === null || config === void 0 ? void 0 : config.enabled;
    })
        .map(function (_a) {
        var platform = _a[0];
        return platform;
    });
}
exports.default = exports.socialMediaConfig;
