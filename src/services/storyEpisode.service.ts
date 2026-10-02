import { Prisma } from '@prisma/client';
import { ConflictError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { storyService } from '@/services/story.service';
import {
  storyLlmService,
  type EpisodeBrief,
  type EpisodeContent,
} from '@/services/storyLlm.service';
import { storyCoverService } from '@/services/storyCover.service';
import { storyPromotionService } from '@/services/storyPromotion.service';
import { storyEpisodeRepository } from '@/repositories/storyEpisode.repository';
import { readerDeviceRepository } from '@/repositories/readerDevice.repository';

export interface GenerateEpisodeOptions {
  instructions?: string;
  /** A retried call with the same key returns the first episode, not a second paid generation. */
  idempotencyKey?: string;
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

interface StoryLike {
  title: string;
  premise: string;
  genre: string | null;
  language: string;
  audience: string | null;
  tone: string | null;
}

interface EarlierEpisode {
  episodeNumber: number;
  title: string;
  hook: string;
  cliffhanger: string | null;
  metadata: unknown;
}

interface PreviousEpisode {
  body: string;
  cliffhanger: string | null;
}

interface EpisodeMemory {
  summary: string | null;
  continuity: string[];
}

const MAX_CONTINUITY_NOTES = 24;
const MAX_ENDING_LENGTH = 700;
const ENDING_PARAGRAPHS = 2;

export function readEpisodeMemory(metadata: unknown): EpisodeMemory {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return { summary: null, continuity: [] };
  }

  const { summary, continuity } = metadata as Record<string, unknown>;
  return {
    summary: typeof summary === 'string' && summary.trim() ? summary.trim() : null,
    continuity: Array.isArray(continuity)
      ? continuity.filter((note): note is string => typeof note === 'string' && note.trim() !== '')
      : [],
  };
}

export function endingOf(body: string): string {
  const paragraphs = body.split(/\n\s*\n/).filter(part => part.trim());
  const tail = paragraphs.slice(-ENDING_PARAGRAPHS).join('\n\n').trim();
  return tail.length > MAX_ENDING_LENGTH
    ? tail.slice(-MAX_ENDING_LENGTH).replace(/^\S*\s/, '')
    : tail;
}

function buildBrief(
  story: StoryLike,
  episodeNumber: number,
  earlier: EarlierEpisode[],
  previous: PreviousEpisode | null,
  instructions?: string
): EpisodeBrief {
  const memories = earlier.map(episode => ({
    episode,
    memory: readEpisodeMemory(episode.metadata),
  }));
  const notes = [...new Set(memories.flatMap(({ memory }) => memory.continuity))];

  return {
    storyTitle: story.title,
    premise: story.premise,
    genre: story.genre ?? undefined,
    language: story.language,
    audience: story.audience ?? undefined,
    tone: story.tone ?? undefined,
    episodeNumber,
    priorEpisodes: memories.map(({ episode, memory }) => ({
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      summary: memory.summary ?? episode.hook,
    })),
    continuityNotes: notes.slice(-MAX_CONTINUITY_NOTES),
    previousEnding: previous ? endingOf(previous.body) || undefined : undefined,
    priorCliffhanger: previous?.cliffhanger ?? undefined,
    instructions,
  };
}

function episodeMetadata(content: EpisodeContent): Prisma.InputJsonObject {
  return { summary: content.summary, continuity: content.continuity_notes };
}

export class StoryEpisodeService {
  async generateNext(storyId: string, options: GenerateEpisodeOptions = {}) {
    if (options.idempotencyKey) {
      const existing = await storyEpisodeRepository.findByIdempotencyKey(
        storyId,
        options.idempotencyKey
      );
      if (existing) {
        logger.info(
          { storyId, episodeId: existing.id, idempotencyKey: options.idempotencyKey },
          'story.episode.generate.replayed'
        );
        return existing;
      }
    }

    const story = await storyService.require(storyId);
    const last = await storyEpisodeRepository.lastForStory(storyId);
    const episodeNumber = (last?.episodeNumber ?? 0) + 1;
    const earlier = await storyEpisodeRepository.findEarlier(storyId, episodeNumber);
    const brief = buildBrief(story, episodeNumber, earlier, last, options.instructions);

    const requestId = `story:${storyId}:episode:${episodeNumber}`;
    const result = await storyLlmService.generateEpisode(brief, requestId, story.userId);

    let episode;
    try {
      episode = await storyEpisodeRepository.create({
        storyId,
        episodeNumber,
        idempotencyKey: options.idempotencyKey,
        title: result.content.title,
        hook: result.content.hook,
        body: result.content.body,
        cliffhanger: result.content.cliffhanger,
        themes: result.content.themes,
        contentWarnings: result.content.content_warnings,
        wordCount: countWords(result.content.body),
        promotionCaption: result.content.promotion_caption,
        promotionHashtags: result.content.promotion_hashtags,
        llmProvider: result.provider,
        llmAttempts: result.attempts,
        status: 'READY_FOR_REVIEW',
        metadata: episodeMetadata(result.content),
      });
    } catch (err) {
      // Two near-simultaneous retries with the same key: the loser here just
      // reads back what the winner wrote, rather than surfacing a 500 after
      // having already paid for the generation.
      if (
        options.idempotencyKey &&
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        const existing = await storyEpisodeRepository.findByIdempotencyKey(
          storyId,
          options.idempotencyKey
        );
        if (existing) {
          return existing;
        }
      }
      throw err;
    }

    if (story.status === 'DRAFT') {
      await storyService.markActive(storyId);
    }

    void storyCoverService.ensure(story);

    logger.info(
      { storyId, episodeId: episode.id, episodeNumber, provider: result.provider },
      'story.episode.generated'
    );
    return episode;
  }

  /**
   * Discards the current draft and writes a fresh one for the same episode
   * number — only while it is still awaiting review, so a reader can never
   * see one episode replaced by another mid-read.
   */
  async regenerate(storyId: string, episodeId: string, options: GenerateEpisodeOptions = {}) {
    const episode = await this.require(storyId, episodeId);
    if (episode.status !== 'READY_FOR_REVIEW') {
      throw new ConflictError('only an episode awaiting review can be regenerated');
    }

    const story = await storyService.require(storyId);
    const prior =
      episode.episodeNumber > 1
        ? await storyEpisodeRepository.findByNumber(storyId, episode.episodeNumber - 1)
        : null;
    const earlier = await storyEpisodeRepository.findEarlier(storyId, episode.episodeNumber);
    const brief = buildBrief(story, episode.episodeNumber, earlier, prior, options.instructions);

    const requestId = `story:${storyId}:episode:${episode.episodeNumber}:retry:${Date.now()}`;
    const result = await storyLlmService.generateEpisode(brief, requestId, story.userId);

    const updated = await storyEpisodeRepository.updateContent(episodeId, {
      title: result.content.title,
      hook: result.content.hook,
      body: result.content.body,
      cliffhanger: result.content.cliffhanger,
      themes: result.content.themes,
      contentWarnings: result.content.content_warnings,
      wordCount: countWords(result.content.body),
      promotionCaption: result.content.promotion_caption,
      promotionHashtags: result.content.promotion_hashtags,
      llmProvider: result.provider,
      llmAttempts: result.attempts,
      metadata: episodeMetadata(result.content),
    });

    logger.info(
      { storyId, episodeId, episodeNumber: episode.episodeNumber, provider: result.provider },
      'story.episode.regenerated'
    );
    return updated;
  }

  async get(storyId: string, episodeId: string) {
    return this.require(storyId, episodeId);
  }

  async getPublicByNumber(storyId: string, episodeNumber: number) {
    const episode = await storyEpisodeRepository.findPublishedByNumber(storyId, episodeNumber);
    if (!episode) {
      throw new NotFoundError('episode not found');
    }
    return episode;
  }

  async recordView(storyId: string, episodeNumber: number, deviceId: string): Promise<void> {
    const episode = await storyEpisodeRepository.findPublishedByNumber(storyId, episodeNumber);
    if (!episode) {
      throw new NotFoundError('episode not found');
    }
    await readerDeviceRepository.touch(deviceId);
    await storyEpisodeRepository.recordView(deviceId, episode.id);
  }

  async recordCompletedRead(
    storyId: string,
    episodeNumber: number,
    deviceId: string
  ): Promise<void> {
    const episode = await storyEpisodeRepository.findPublishedByNumber(storyId, episodeNumber);
    if (!episode) {
      throw new NotFoundError('episode not found');
    }
    await readerDeviceRepository.touch(deviceId);
    await storyEpisodeRepository.recordCompletion(deviceId, episode.id);
  }

  async list(storyId: string, params: { page?: number; limit?: number } = {}) {
    await storyService.require(storyId);
    return storyEpisodeRepository.list(storyId, params);
  }

  async approve(storyId: string, episodeId: string) {
    const episode = await this.require(storyId, episodeId);
    if (episode.status !== 'READY_FOR_REVIEW') {
      throw new ConflictError('only an episode awaiting review can be approved');
    }
    return storyEpisodeRepository.updateStatus(episodeId, 'APPROVED');
  }

  async publish(storyId: string, episodeId: string) {
    const episode = await this.require(storyId, episodeId);
    if (episode.status !== 'APPROVED') {
      throw new ConflictError('an episode must be approved before it can be published');
    }

    const story = await storyService.require(storyId);
    await storyEpisodeRepository.updateStatus(episodeId, 'PUBLISHED', { publishedAt: new Date() });

    if (story.autoPromote) {
      const published = await storyEpisodeRepository.findById(episodeId);
      if (published) {
        await storyPromotionService.promote(story, published);
      }
    }

    return storyEpisodeRepository.findById(episodeId);
  }

  async retryPromotion(storyId: string, episodeId: string) {
    const episode = await this.require(storyId, episodeId);
    if (episode.status !== 'PUBLISHED') {
      throw new ConflictError('only a published episode can be promoted');
    }
    if (episode.promotionStatus !== 'failed') {
      throw new ConflictError('this episode does not have a failed promotion to retry');
    }

    const story = await storyService.require(storyId);
    await storyPromotionService.promote(story, episode);

    logger.info({ storyId, episodeId }, 'story.episode.promotion_retried');
    return storyEpisodeRepository.findById(episodeId);
  }

  private async require(storyId: string, episodeId: string) {
    const episode = await storyEpisodeRepository.findByIdInStory(storyId, episodeId);
    if (!episode) {
      throw new NotFoundError('episode not found');
    }
    return episode;
  }
}

export const storyEpisodeService = new StoryEpisodeService();
