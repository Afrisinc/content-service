/** Every publish path builds its payload here, so no caller can drop a column. */

import { SocialMediaPost } from '@prisma/client';
import {
  SocialMediaPlatform,
  SocialMediaPostPayload,
  SocialPostFormat,
} from '@/types/socialMedia.types';
import { logger } from '@/utils/logger';

/**
 * `aiGenerated` is read from the column, not the metadata blob: posts created by
 * the AI generator set the column but do not repeat the flag inside the JSON, so
 * trusting the blob alone silently drops the AI disclosure.
 */
export function buildSocialMediaPayloadFromPost(
  post: SocialMediaPost,
  accessToken: string
): SocialMediaPostPayload {
  return {
    platform: post.platform as SocialMediaPlatform,
    pageId: post.pageId,
    format: (post.postFormat as SocialPostFormat) || SocialPostFormat.FEED,
    content: {
      message: post.message || '',
      link: post.link || undefined,
      description: post.description || undefined,
      picture: post.picture || undefined,
      name: post.name || undefined,
      caption: post.caption || undefined,
      tags: post.tags,
    },
    media: post.mediaType
      ? {
          type: post.mediaType as 'image' | 'video' | 'carousel',
          url: post.mediaUrls?.[0],
          urls: post.mediaUrls,
          alt_text: post.altText || undefined,
        }
      : undefined,
    accessToken,
    metadata: {
      ...parseStoredMetadata(post.metadata),
      aiGenerated: post.aiGenerated ?? false,
      generatedBy: post.aiProvider || undefined,
      generationPrompt: post.aiPrompt || undefined,
    },
  };
}

/** A malformed metadata blob must not take the whole post down. */
function parseStoredMetadata(metadata: string | null): Record<string, unknown> {
  if (!metadata) {
    return {};
  }

  try {
    return JSON.parse(metadata);
  } catch {
    logger.warn('Stored post metadata is not valid JSON, ignoring it');
    return {};
  }
}
