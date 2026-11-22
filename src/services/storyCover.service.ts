import type { Story } from '@prisma/client';
import { env } from '@/config/env';
import { storyCoverPrompt } from '@/helpers/coverPrompt.helper';
import { storyRepository } from '@/repositories/story.repository';
import { drawCoverImage } from '@/services/coverImage.service';
import { getAssetsClient, socialMediaFolderId } from '@/utils/assets-client';
import { logger } from '@/utils/logger';

type CoverSubject = Pick<Story, 'id' | 'userId' | 'title' | 'premise' | 'genre' | 'tone'>;

export class StoryCoverService {
  async generate(story: CoverSubject): Promise<string> {
    const image = await drawCoverImage({
      prompt: storyCoverPrompt(story),
      defaultModel: env.STORY_COVER_MODEL,
      size: env.STORY_COVER_SIZE,
      quality: env.STORY_COVER_QUALITY,
      requestId: `story-cover:${story.id}`,
      userId: story.userId,
    });

    const asset = await getAssetsClient().uploadBuffer(image, `story-cover-${story.id}.png`, {
      folderId: socialMediaFolderId(),
      tags: ['story', 'story-cover', 'ai-generated'],
    });
    if (!asset?.url) {
      throw new Error('the assets service returned no URL for the cover');
    }

    await storyRepository.setCoverImage(story.id, asset.url);
    logger.info({ storyId: story.id }, 'story.cover.generated');
    return asset.url;
  }

  async ensure(story: CoverSubject & Pick<Story, 'coverImageUrl'>): Promise<void> {
    if (story.coverImageUrl) {
      return;
    }

    try {
      await this.generate(story);
    } catch (error) {
      logger.warn(
        { storyId: story.id, error: error instanceof Error ? error.message : String(error) },
        'story.cover.failed'
      );
    }
  }
}

export const storyCoverService = new StoryCoverService();
