import { StoryStatus } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { storyRepository, type CreateStoryInput } from '@/repositories/story.repository';
import { storyEpisodeRepository } from '@/repositories/storyEpisode.repository';

export interface StoryBrief extends CreateStoryInput {
  userId: string;
}

/** The public site only ever needs to know whether a series is still being written. */
function publicReadingStatus(status: StoryStatus): 'ongoing' | 'completed' {
  return status === 'COMPLETED' || status === 'ARCHIVED' ? 'completed' : 'ongoing';
}

function toPublicStory<T extends { status: StoryStatus }>(
  story: T
): Omit<T, 'status'> & { status: 'ongoing' | 'completed' } {
  return { ...story, status: publicReadingStatus(story.status) };
}

export function assertStoryBrief(brief: Partial<StoryBrief>): void {
  if (!brief.title || brief.title.trim().length < 3) {
    throw new BadRequestError('a story needs a title of at least three characters');
  }
  if (!brief.premise || brief.premise.trim().length < 20) {
    throw new BadRequestError(
      'the premise needs at least twenty characters for the writer to work with'
    );
  }
}

export class StoryService {
  async create(brief: StoryBrief) {
    const story = await storyRepository.create(brief);
    logger.info({ storyId: story.id, userId: brief.userId }, 'story.created');
    return story;
  }

  async get(storyId: string) {
    const story = await storyRepository.findWithEpisodes(storyId);
    if (!story) {
      throw new NotFoundError('story not found');
    }
    return story;
  }

  async list(params: { userId?: string; status?: StoryStatus; page?: number; limit?: number }) {
    return storyRepository.list(params);
  }

  /**
   * `deviceId` is optional — an anonymous reader is a normal, fully-served
   * visitor. When it's present, each episode gets `viewed`/`completed` flags
   * so the reader UI can show "already read" and pick up where they left off.
   */
  async getPublic(storyId: string, deviceId?: string) {
    const story = await storyRepository.findPublishedById(storyId);
    if (!story) {
      throw new NotFoundError('story not found');
    }

    if (!deviceId) {
      return toPublicStory(story);
    }

    const episodeIds = story.episodes.map(episode => episode.id);
    const state = await storyEpisodeRepository.readingStateForDevice(deviceId, episodeIds);
    const stateByEpisode = new Map(state.map(row => [row.episodeId, row.completed]));

    return toPublicStory({
      ...story,
      episodes: story.episodes.map(episode => ({
        ...episode,
        viewed: stateByEpisode.has(episode.id),
        completed: stateByEpisode.get(episode.id) ?? false,
      })),
    });
  }

  async listPublic(params: { page?: number; limit?: number }) {
    const result = await storyRepository.listPublished(params);
    return { ...result, items: result.items.map(toPublicStory) };
  }

  async require(storyId: string) {
    const story = await storyRepository.findById(storyId);
    if (!story) {
      throw new NotFoundError('story not found');
    }
    return story;
  }

  async markActive(storyId: string) {
    return storyRepository.updateStatus(storyId, 'ACTIVE');
  }

  async complete(storyId: string) {
    return storyRepository.updateStatus(storyId, 'COMPLETED');
  }
}

export const storyService = new StoryService();
