import { Story, StoryEpisode } from '@prisma/client';
import { env } from '@/config/env';
import { postAgentService } from '@/services/postAgent.service';
import { storyEpisodeRepository } from '@/repositories/storyEpisode.repository';
import { logger } from '@/utils/logger';

function episodeUrl(story: Story, episode: StoryEpisode): string {
  return `${env.STORY_PUBLIC_BASE_URL}/${story.id}/episodes/${episode.episodeNumber}`;
}

/**
 * Advertises a published episode through the existing post agent instead of posting to
 * social platforms directly. A promotion failure must never undo the publish, so every
 * outcome — success or failure — is recorded on the episode and nothing here throws.
 */
export class StoryPromotionService {
  async promote(story: Story, episode: StoryEpisode): Promise<void> {
    try {
      const draft = await postAgentService.createFromBrief({
        userId: story.userId,
        groupId: story.groupId ?? undefined,
        topic: `New episode — ${episode.title}: ${episode.hook}`,
        format: 'single',
        audience: story.audience ?? undefined,
        keywords: episode.promotionHashtags.join(' ') || episode.themes.join(', '),
        link: episodeUrl(story, episode),
        autoPublish: story.autoApprovePromotion,
        trigger: 'story-agent',
      });

      await storyEpisodeRepository.setPromotionResult(episode.id, {
        promotionDraftId: draft.id,
        promotionStatus: story.autoApprovePromotion ? 'queued' : 'awaiting_review',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(
        { storyId: story.id, episodeId: episode.id, error: message },
        'story agent: promotion failed, episode stays published'
      );
      await storyEpisodeRepository.setPromotionResult(episode.id, {
        promotionStatus: 'failed',
        promotionError: message.slice(0, 500),
      });
    }
  }
}

export const storyPromotionService = new StoryPromotionService();
