/**
 * Social Media Types and Interfaces
 * Supports multiple platforms and extensible for AI content generation
 */

export enum SocialMediaPlatform {
  FACEBOOK = 'facebook',
  INSTAGRAM = 'instagram',
  TWITTER = 'twitter',
  LINKEDIN = 'linkedin',
  TIKTOK = 'tiktok',
}

export interface FacebookPostPayload {
  message?: string;
  link?: string;
  description?: string;
  picture?: string;
  name?: string;
  caption?: string;
  type?: 'link' | 'video' | 'photo' | 'status';
  story?: string;
  privacy?: FacebookPrivacy;
  scheduled_publish_time?: number;
  access_token: string;
  // Additional Facebook Graph API fields
  icon?: string;
  source?: string;
  targeting?: FacebookTargeting;
  backdated_time?: string;
  tags?: string;
  object_attachment?: string;
}

export interface FacebookPrivacy {
  value: 'EVERYONE' | 'FRIENDS' | 'SELF' | 'CUSTOM';
  allow?: string[];
  deny?: string[];
}

export interface FacebookTargeting {
  age_min?: number;
  age_max?: number;
  genders?: number[];
  countries?: string[];
  regions?: string[];
  cities?: string[];
  locales?: number[];
  interests?: string[];
  keywords?: string[];
  relationship_statuses?: number[];
  education_statuses?: number[];
  college_years?: number[];
  employment_statuses?: number[];
  job_titles?: string[];
  work_positions?: string[];
  work_employers?: string[];
  education_schools?: string[];
}

export interface SocialMediaPostPayload {
  platform: SocialMediaPlatform;
  pageId: string;
  content: {
    message?: string;
    link?: string;
    description?: string;
    picture?: string;
    name?: string;
    caption?: string;
    tags?: string[];
  };
  media?: {
    type: 'image' | 'video' | 'carousel';
    url?: string;
    urls?: string[];
    alt_text?: string;
  };
  scheduling?: {
    scheduled_publish_time?: number;
    publish_immediately?: boolean;
  };
  targeting?: FacebookTargeting;
  metadata?: {
    aiGenerated?: boolean;
    generatedBy?: string;
    generationPrompt?: string;
    timestamp?: string;
  };
  accessToken: string;
}

export interface SocialMediaPostResult {
  platform: SocialMediaPlatform;
  postId: string;
  status: 'success' | 'pending' | 'failed';
  message: string;
  publishedAt?: string;
  error?: string;
  metadata?: Record<string, any>;
}

export interface AIContentGenerationConfig {
  enabled: boolean;
  provider?: 'openai' | 'anthropic' | 'huggingface';
  model?: string;
  maxLength?: number;
  tone?: 'professional' | 'casual' | 'humorous' | 'promotional';
  includeEmojis?: boolean;
  includeHashtags?: boolean;
  language?: string;
}

export interface SocialMediaConfig {
  platforms: {
    [key in SocialMediaPlatform]?: {
      enabled: boolean;
      accessToken?: string;
      pageId?: string;
      appId?: string;
      appSecret?: string;
    };
  };
  aiContent?: AIContentGenerationConfig;
}
