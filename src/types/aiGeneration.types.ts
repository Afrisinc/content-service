/**
 * AI Generation Types
 * Interfaces for AI-powered content generation
 */

import { SocialMediaPlatform } from './socialMedia.types';

export interface GeneratePostRequest {
  prompt: string;
  platforms: SocialMediaPlatform[];
  tone?: 'professional' | 'casual' | 'humorous' | 'promotional';
  includeEmojis?: boolean;
  includeHashtags?: boolean;
  maxLength?: number;
  language?: string;
  scheduleFor?: Date | null; // null = publish immediately, Date = schedule
  userId?: string;
  imageUrl?: string; // URL of image to include in post
  includeImage?: boolean; // Generate image using DALL-E when true
  imageStyle?: 'realistic' | 'cartoon' | 'abstract' | 'minimalist'; // Style for generated image
}

export interface GeneratePostResponse {
  success: boolean;
  message: string;
  data?: {
    postIds: string[];
    platforms: SocialMediaPlatform[];
    content: Record<string, string>;
    scheduledFor?: Date | null;
    hashtags?: string[];
    imageUrl?: string;
    imageCaption?: string;
    metadata: {
      model: string;
      provider: string;
      generationPrompt: string;
      timestamp: string;
      tokensUsed?: number;
    };
  };
  error?: string;
}

export interface AIContentGenerationConfig {
  enabled: boolean;
  provider: 'openai' | 'anthropic' | 'huggingface';
  model: string;
  maxLength: number;
  tone: 'professional' | 'casual' | 'humorous' | 'promotional';
  includeEmojis: boolean;
  includeHashtags: boolean;
  language: string;
}

export interface ScheduledPost {
  id: string;
  userId: string;
  content: Record<string, string>;
  platforms: SocialMediaPlatform[];
  scheduledFor: Date;
  status: 'scheduled' | 'published' | 'failed';
  error?: string;
  createdAt: Date;
  publishedAt?: Date;
}

export interface PostSchedulePayload {
  postId: string;
  scheduledFor?: Date;
  platforms: SocialMediaPlatform[];
  content: Record<string, string>;
  hashtags?: string[];
}
