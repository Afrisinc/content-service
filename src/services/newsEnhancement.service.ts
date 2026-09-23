import type { N8nArticle } from '@prisma/client';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import { env } from '@/config/env';
import {
  buildEnhancementPrompt,
  parseEnhancement,
  type EnhancedArticle,
} from '@/helpers/newsEnhancement.helper';
import { chatGptCredentialsFromEnv, runChatGpt } from '@/nodes';
import { n8nArticleRepository } from '@/repositories/n8nArticle.repository';
import { STUCK_AFTER_MINUTES } from '@/types/newsDesk.types';
import { getAssetsClient } from '@/utils/assets-client';
import { logger } from '@/utils/logger';

export interface ArticlePrompt {
  articleId: bigint;
  systemPrompt: string;
  prompt: string;
}

export interface NewsEnhancementDeps {
  writeArticle(input: ArticlePrompt): Promise<unknown>;
  drawCover(prompt: string, articleId: bigint): Promise<Buffer>;
  storeCover(image: Buffer, filename: string): Promise<string>;
}

export type EnhancementOutcome = 'published' | 'rejected' | 'failed';

export interface EnhancementResult {
  startedAt: string;
  finishedAt: string;
  claimed: number;
  published: number;
  rejected: number;
  failed: number;
  recovered: number;
}

const ORPHANED_REASON =
  'The enhancement run stopped before it finished. Send it back to the queue to try again.';

const MAX_ERROR_LENGTH = 1000;

function socialMediaFolderId(): string | undefined {
  const id = (globalThis as { SOCIAL_MEDIA_FOLDER_ID?: string }).SOCIAL_MEDIA_FOLDER_ID;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

const openAiDeps: NewsEnhancementDeps = {
  async writeArticle({ articleId, systemPrompt, prompt }) {
    const items = await runChatGpt({
      credentials: chatGptCredentialsFromEnv(),
      logger,
      services: nodeServices,
      usageContext: { requestId: `news-enhance:${articleId.toString()}` },
      parameters: {
        resource: 'text',
        operation: 'message',
        model: env.NEWS_TEXT_MODEL,
        systemPrompt,
        prompt,
        jsonOutput: true,
        options: { temperature: 0.4, maxTokens: 4000 },
      },
    });
    return items[0]?.json?.parsed;
  },

  async drawCover(prompt, articleId) {
    const items = await runChatGpt({
      credentials: chatGptCredentialsFromEnv(),
      logger,
      services: nodeServices,
      usageContext: { requestId: `news-cover:${articleId.toString()}` },
      parameters: {
        resource: 'image',
        operation: 'generate',
        model: env.NEWS_IMAGE_MODEL,
        prompt,
        options: {
          size: env.NEWS_IMAGE_SIZE,
          quality: env.NEWS_IMAGE_QUALITY,
          responseFormat: 'b64_json',
        },
      },
    });
    const images = items[0]?.json?.images as { b64Json?: string | null }[] | undefined;
    const encoded = images?.[0]?.b64Json;
    if (!encoded) {
      throw new Error('the image model returned no cover');
    }
    return Buffer.from(encoded, 'base64');
  },

  async storeCover(image, filename) {
    const asset = await getAssetsClient().uploadBuffer(image, filename, {
      folderId: socialMediaFolderId(),
      tags: ['news', 'article-cover', 'ai-generated'],
    });
    if (!asset?.url) {
      throw new Error('the assets service returned no URL for the cover');
    }
    return asset.url;
  },
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function rejectionNote(enhanced: EnhancedArticle): string {
  const reason = enhanced.rejectReason ?? 'below the relevance threshold';
  return `Rejected by the AI editor (score ${enhanced.score.toFixed(2)}): ${reason}`.slice(
    0,
    MAX_ERROR_LENGTH
  );
}

export class NewsEnhancementService {
  constructor(private readonly deps: NewsEnhancementDeps = openAiDeps) {}

  async run(): Promise<EnhancementResult> {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not configured — the news agent cannot enhance articles');
    }

    const startedAt = new Date();
    const cutoff = new Date(startedAt.getTime() - STUCK_AFTER_MINUTES * 60 * 1000);
    const recovered = await n8nArticleRepository.failOrphaned(cutoff, ORPHANED_REASON);
    const articles = await n8nArticleRepository.claimForEnhancement(env.NEWS_ENHANCE_BATCH_SIZE);

    const tally: Record<EnhancementOutcome, number> = { published: 0, rejected: 0, failed: 0 };
    // One at a time: each article is two paid OpenAI calls, and the image API is rate limited.
    for (const article of articles) {
      tally[await this.enhance(article)] += 1;
    }

    const result: EnhancementResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      claimed: articles.length,
      ...tally,
      recovered,
    };
    logger.info(result, 'news_enhancement.completed');
    return result;
  }

  async enhance(article: N8nArticle): Promise<EnhancementOutcome> {
    try {
      const { systemPrompt, prompt } = buildEnhancementPrompt(article);
      const reply = await this.deps.writeArticle({ articleId: article.id, systemPrompt, prompt });
      const enhanced = parseEnhancement(reply, article);

      if (!enhanced.shouldPublish || enhanced.score < env.NEWS_MIN_SCORE) {
        await n8nArticleRepository.update(article.id, {
          status: 'skipped',
          processing_error: rejectionNote(enhanced),
        });
        logger.info(
          { articleId: article.id.toString(), score: enhanced.score },
          'news_enhancement.rejected'
        );
        return 'rejected';
      }

      const slug = await this.uniqueSlug(enhanced.slug, article.id);
      const cover = await this.deps.drawCover(enhanced.imagePrompt, article.id);
      const coverUrl = await this.deps.storeCover(cover, `${slug}.png`);

      await this.publish(article, enhanced, slug, coverUrl, `${systemPrompt}\n\n---\n\n${prompt}`);
      logger.info(
        { articleId: article.id.toString(), slug, score: enhanced.score },
        'news_enhancement.published'
      );
      return 'published';
    } catch (error) {
      await n8nArticleRepository.update(article.id, {
        status: 'failed',
        processing_error: errorMessage(error),
      });
      logger.warn(
        { articleId: article.id.toString(), error: errorMessage(error) },
        'news_enhancement.failed'
      );
      return 'failed';
    }
  }

  private async uniqueSlug(slug: string, articleId: bigint): Promise<string> {
    if (!(await n8nArticleRepository.isSlugTaken(slug, articleId))) {
      return slug;
    }
    const withId = `${slug}-${articleId.toString()}`;
    if (!(await n8nArticleRepository.isSlugTaken(withId, articleId))) {
      return withId;
    }
    return `${withId}-${Date.now().toString(36)}`;
  }

  private async publish(
    article: N8nArticle,
    enhanced: EnhancedArticle,
    slug: string,
    coverUrl: string,
    aiPrompt: string
  ) {
    const publishedAt = new Date();

    await n8nArticleRepository.publishEnhanced(
      article.id,
      {
        n8nArticleId: article.id,
        title: enhanced.title,
        slug,
        content: enhanced.content,
        excerpt: enhanced.excerpt || null,
        cover_image: coverUrl,
        cover_alt: enhanced.coverAlt,
        media_type: 'image',
        category: enhanced.category,
        tags: enhanced.tags,
        topic: enhanced.topic,
        meta_title: enhanced.metaTitle,
        meta_description: enhanced.metaDescription,
        og_title: enhanced.ogTitle,
        og_description: enhanced.ogDescription,
        og_image: coverUrl,
        twitter_title: enhanced.twitterTitle,
        twitter_description: enhanced.twitterDescription,
        status: 'PUBLISHED',
        published_at: publishedAt,
        read_time: enhanced.readTime,
        word_count: enhanced.wordCount,
        language: 'en',
        ai_generated: true,
        ai_provider: 'openai',
        ai_model: env.NEWS_TEXT_MODEL,
        ai_prompt: aiPrompt,
        ai_score: enhanced.score,
        source_url: article.source_url,
        source_name: article.creator,
        rss_guid: article.guid,
      },
      {
        status: 'published',
        slug,
        tags: enhanced.tags,
        read_time: enhanced.readTime,
        image_url: coverUrl,
        ai_generated: true,
        processing_error: null,
      }
    );
  }
}

export const newsEnhancementService = new NewsEnhancementService();
