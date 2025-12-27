/**
 * Social Media Configuration
 * Centralized configuration for social media platforms and AI integration
 */

import {
  SocialMediaConfig,
  SocialMediaPlatform,
} from '@/types/socialMedia.types';

/**
 * Social Media Platform Configuration
 * Each platform can have different API versions, endpoints, and requirements
 */
export const socialMediaConfig: SocialMediaConfig = {
  platforms: {
    [SocialMediaPlatform.FACEBOOK]: {
      enabled: true,
      appId: process.env.FACEBOOK_APP_ID,
      appSecret: process.env.FACEBOOK_APP_SECRET,
      accessToken: process.env.FACEBOOK_PAGE_ACCESS_TOKEN,
      pageId: process.env.FACEBOOK_PAGE_ID,
    },
    [SocialMediaPlatform.INSTAGRAM]: {
      enabled: false, // Coming soon
      appId: process.env.INSTAGRAM_APP_ID,
      appSecret: process.env.INSTAGRAM_APP_SECRET,
      accessToken: process.env.INSTAGRAM_ACCESS_TOKEN,
      pageId: process.env.INSTAGRAM_PAGE_ID,
    },
    [SocialMediaPlatform.TWITTER]: {
      enabled: false, // Coming soon
      appId: process.env.TWITTER_API_KEY,
      appSecret: process.env.TWITTER_API_SECRET,
      accessToken: process.env.TWITTER_ACCESS_TOKEN,
    },
    [SocialMediaPlatform.LINKEDIN]: {
      enabled: false, // Coming soon
      appId: process.env.LINKEDIN_CLIENT_ID,
      appSecret: process.env.LINKEDIN_CLIENT_SECRET,
      accessToken: process.env.LINKEDIN_ACCESS_TOKEN,
    },
    [SocialMediaPlatform.TIKTOK]: {
      enabled: false, // Coming soon
      appId: process.env.TIKTOK_CLIENT_KEY,
      appSecret: process.env.TIKTOK_CLIENT_SECRET,
      accessToken: process.env.TIKTOK_ACCESS_TOKEN,
    },
  },

  aiContent: {
    enabled: process.env.AI_CONTENT_GENERATION_ENABLED === 'true',
    provider:
      (process.env.AI_PROVIDER as 'openai' | 'anthropic' | 'huggingface') ||
      'openai',
    model: process.env.AI_MODEL || 'gpt-4',
    maxLength: parseInt(process.env.AI_CONTENT_MAX_LENGTH || '500'),
    tone:
      (process.env.AI_TONE as
        | 'professional'
        | 'casual'
        | 'humorous'
        | 'promotional') || 'professional',
    includeEmojis: process.env.AI_INCLUDE_EMOJIS === 'true',
    includeHashtags: process.env.AI_INCLUDE_HASHTAGS === 'true',
    language: process.env.AI_LANGUAGE || 'en',
  },
};

/**
 * API Configuration for different social media platforms
 */
export const platformApiConfig = {
  facebook: {
    apiVersion: 'v24.0',
    baseUrl: 'https://graph.facebook.com',
    endpoints: {
      feed: (pageId: string) => `/v24.0/${pageId}/feed`,
      post: (postId: string) => `/v24.0/${postId}`,
      insights: (pageId: string) => `/v24.0/${pageId}/insights`,
    },
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  instagram: {
    apiVersion: 'v24.0',
    baseUrl: 'https://graph.instagram.com',
    endpoints: {
      media: (userId: string) => `/v24.0/${userId}/media`,
      caption: (mediaId: string) => `/v24.0/${mediaId}`,
      insights: (mediaId: string) => `/v24.0/${mediaId}/insights`,
    },
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  twitter: {
    apiVersion: '2',
    baseUrl: 'https://api.twitter.com',
    endpoints: {
      tweets: () => '/2/tweets',
      retweets: (tweetId: string) => `/2/tweets/${tweetId}/retweeted_by`,
    },
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  linkedin: {
    apiVersion: 'v2',
    baseUrl: 'https://api.linkedin.com',
    endpoints: {
      ugcPosts: () => '/v2/ugcPosts',
      organizations: (orgId: string) => `/v2/organizations/${orgId}`,
    },
    timeout: 30000,
    maxRetries: 3,
    retryDelay: 1000,
  },
  tiktok: {
    apiVersion: 'v1',
    baseUrl: 'https://open.tiktok.com',
    endpoints: {
      publish: () => '/v1/post/publish/',
      videos: () => '/v1/videos/search',
    },
    timeout: 60000,
    maxRetries: 3,
    retryDelay: 2000,
  },
};

/**
 * Content length limits for each platform
 */
export const platformContentLimits = {
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
export const retryConfig = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Rate limiting configuration
 */
export const rateLimitConfig = {
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
export function validateSocialMediaConfig(): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (socialMediaConfig.platforms[SocialMediaPlatform.FACEBOOK]?.enabled) {
    if (!process.env.FACEBOOK_PAGE_ACCESS_TOKEN) {
      errors.push(
        'FACEBOOK_PAGE_ACCESS_TOKEN is required for Facebook integration'
      );
    }
    if (!process.env.FACEBOOK_PAGE_ID) {
      errors.push('FACEBOOK_PAGE_ID is required for Facebook integration');
    }
  }

  if (socialMediaConfig.aiContent?.enabled) {
    if (!process.env.AI_API_KEY) {
      errors.push('AI_API_KEY is required for AI content generation');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Get platform configuration
 */
export function getPlatformConfig(platform: SocialMediaPlatform) {
  return socialMediaConfig.platforms[platform];
}

/**
 * Get platform API configuration
 */
export function getPlatformApiConfig(platform: SocialMediaPlatform) {
  return platformApiConfig[
    platform.toLowerCase() as keyof typeof platformApiConfig
  ];
}

/**
 * Get platform content limits
 */
export function getPlatformLimits(platform: SocialMediaPlatform) {
  return platformContentLimits[
    platform.toLowerCase() as keyof typeof platformContentLimits
  ];
}

/**
 * Check if platform is enabled
 */
export function isPlatformEnabled(platform: SocialMediaPlatform): boolean {
  return socialMediaConfig.platforms[platform]?.enabled ?? false;
}

/**
 * Get enabled platforms
 */
export function getEnabledPlatforms(): SocialMediaPlatform[] {
  return Object.entries(socialMediaConfig.platforms)
    .filter(([, config]) => config?.enabled)
    .map(([platform]) => platform as SocialMediaPlatform);
}

export default socialMediaConfig;
