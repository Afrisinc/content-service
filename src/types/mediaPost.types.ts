/**
 * MediaPost Types and Interfaces
 * Comprehensive types for article/media post management
 */

export enum MediaPostStatus {
  DRAFT = 'DRAFT',
  SCHEDULED = 'SCHEDULED',
  PUBLISHED = 'PUBLISHED',
  ARCHIVED = 'ARCHIVED',
}

export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  CAROUSEL = 'carousel',
}

export interface CreateMediaPostPayload {
  title: string;
  content: string;
  authorId?: string;
  n8nArticleId?: bigint;
  excerpt?: string;
  cover_image?: string;
  cover_alt?: string;
  media_type?: MediaType;
  video_url?: string;
  video_poster?: string;
  video_duration?: number;
  media_urls?: string[];
  category?: string;
  tags?: string[];
  topic?: string;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  twitter_card?: string;
  twitter_title?: string;
  twitter_description?: string;
  slug: string;
  status?: MediaPostStatus;
  is_featured?: boolean;
  is_breaking?: boolean;
  is_sponsored?: boolean;
  sponsor_name?: string;
  sponsor_url?: string;
  published_at?: Date;
  scheduled_at?: Date;
  read_time?: number;
  language?: string;
  word_count?: number;
  ai_generated?: boolean;
  ai_provider?: string;
  ai_model?: string;
  ai_prompt?: string;
  ai_score?: number;
  source_url?: string;
  source_name?: string;
  in_newsletter?: boolean;
  rss_guid?: string;
}

export interface UpdateMediaPostPayload {
  title?: string;
  slug?: string;
  content?: string;
  excerpt?: string;
  cover_image?: string;
  cover_alt?: string;
  media_type?: MediaType;
  video_url?: string;
  video_poster?: string;
  video_duration?: number;
  media_urls?: string[];
  category?: string;
  tags?: string[];
  topic?: string;
  meta_title?: string;
  meta_description?: string;
  canonical_url?: string;
  og_title?: string;
  og_description?: string;
  og_image?: string;
  twitter_card?: string;
  twitter_title?: string;
  twitter_description?: string;
  status?: MediaPostStatus;
  is_featured?: boolean;
  is_breaking?: boolean;
  is_sponsored?: boolean;
  sponsor_name?: string;
  sponsor_url?: string;
  published_at?: Date;
  scheduled_at?: Date;
  read_time?: number;
  language?: string;
  word_count?: number;
  ai_generated?: boolean;
  ai_provider?: string;
  ai_model?: string;
  ai_prompt?: string;
  ai_score?: number;
  source_url?: string;
  source_name?: string;
  in_newsletter?: boolean;
  rss_guid?: string;
}

export interface MediaPostQueryParams {
  page?: number;
  limit?: number;
  status?: MediaPostStatus;
  category?: string;
  topic?: string;
  is_featured?: boolean;
  is_breaking?: boolean;
  ai_generated?: boolean;
  in_newsletter?: boolean;
  search?: string;
  sortBy?: 'published_at' | 'created_at' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

export interface MediaPostResponse {
  id: string;
  title: string;
  slug: string;
  excerpt?: string;
  cover_image?: string;
  cover_alt?: string;
  media_type?: string;
  video_url?: string;
  video_poster?: string;
  video_duration?: number;
  media_urls?: string[];
  category?: string;
  tags?: string[];
  topic?: string;
  status: MediaPostStatus;
  is_featured: boolean;
  is_breaking: boolean;
  is_sponsored: boolean;
  published_at?: Date;
  scheduled_at?: Date;
  read_time: number;
  language: string;
  views: number;
  shares: number;
  authorId?: string;
  source_url?: string;
  source_name?: string;
  ai_generated: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface PaginatedMediaPostResponse {
  data: MediaPostResponse[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

export interface MediaPostStats {
  totalPosts: number;
  publishedPosts: number;
  draftPosts: number;
  scheduledPosts: number;
  archivedPosts: number;
  featuredPosts: number;
  breakingPosts: number;
  totalViews: number;
  totalShares: number;
  averageReadTime: number;
}

export interface BulkMediaPostAction {
  ids: string[];
  action: 'publish' | 'draft' | 'archive' | 'feature' | 'unfeature' | 'delete';
  data?: Record<string, any>;
}
