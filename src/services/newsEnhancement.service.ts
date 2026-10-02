import type { N8nArticle } from '@prisma/client';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import { env } from '@/config/env';
import {
  buildEnhancementPrompt,
  coverPrompt,
  parseEnhancement,
  type EnhancedArticle,
} from '@/helpers/newsEnhancement.helper';
import { runChatGpt } from '@/nodes';
import { articleUrl } from '@/helpers/newsletterDigest.helper';
import { drawCoverImage } from '@/services/coverImage.service';
import { agentSettingsService } from '@/services/agentSettings.service';
import { automationService } from '@/services/automation.service';
import { resolveChatGptConfig } from '@/services/aiCredentials.service';
import { n8nArticleRepository } from '@/repositories/n8nArticle.repository';
import {
  STUCK_AFTER_MINUTES,
  type NewsPostSource,
  type NewsSocialOutcome,
} from '@/types/newsDesk.types';
import { getAssetsClient, socialMediaFolderId } from '@/utils/assets-client';
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
  postToSocial?(source: NewsPostSource): Promise<NewsSocialOutcome[]>;
}

export type EnhancementOutcome = 'published' | 'rejected' | 'failed';

export interface ArticleResult {
  articleId: string;
  headline: string;
  outcome: EnhancementOutcome;
  score: number | null;
  reason: string | null;
  social: NewsSocialOutcome[];
}

export interface EnhancementResult {
  startedAt: string;
  finishedAt: string;
  claimed: number;
  published: number;
  rejected: number;
  failed: number;
  articles: ArticleResult[];
  recovered: number;
}

const ORPHANED_REASON =
  'The enhancement run stopped before it finished. Send it back to the queue to try again.';

const MAX_ERROR_LENGTH = 1000;

const openAiDeps: NewsEnhancementDeps = {
  async writeArticle({ articleId, systemPrompt, prompt }) {
    const { credentials } = await resolveChatGptConfig();
    const items = await runChatGpt({
      credentials,
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
    return drawCoverImage({
      prompt: coverPrompt(prompt),
      defaultModel: env.NEWS_IMAGE_MODEL,
      size: env.NEWS_IMAGE_SIZE,
      quality: env.NEWS_IMAGE_QUALITY,
      requestId: `news-cover:${articleId.toString()}`,
    });
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

  postToSocial: source => automationService.draftNewsPosts(source),
};

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, MAX_ERROR_LENGTH);
}

function rejectionReason(enhanced: EnhancedArticle): string {
  if (enhanced.rejectReason) {
    return enhanced.rejectReason;
  }
  return enhanced.shouldPublish
    ? `score ${enhanced.score.toFixed(2)} is below the ${env.NEWS_MIN_SCORE} minimum`
    : 'the editor chose not to publish it';
}

function rejectionNote(enhanced: EnhancedArticle): string {
  const verdict = `Rejected by the AI editor (score ${enhanced.score.toFixed(2)})`;
  return `${verdict}: ${rejectionReason(enhanced)}`.slice(0, MAX_ERROR_LENGTH);
}

export class NewsEnhancementService {
  constructor(private readonly deps: NewsEnhancementDeps = openAiDeps) {}

  async run(): Promise<EnhancementResult> {
    await resolveChatGptConfig();

    const startedAt = new Date();
    const cutoff = new Date(startedAt.getTime() - STUCK_AFTER_MINUTES * 60 * 1000);
    const recovered = await n8nArticleRepository.failOrphaned(cutoff, ORPHANED_REASON);
    const { batchSize } = await agentSettingsService.getNewsSettings();
    const articles = await n8nArticleRepository.claimForEnhancement(batchSize);

    const articleResults: ArticleResult[] = [];
    // One at a time: each article is two paid OpenAI calls, and the image API is rate limited.
    for (const article of articles) {
      articleResults.push(await this.enhanceArticle(article));
    }

    const count = (outcome: EnhancementOutcome) =>
      articleResults.filter(result => result.outcome === outcome).length;

    const result: EnhancementResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
      claimed: articleResults.length,
      published: count('published'),
      rejected: count('rejected'),
      failed: count('failed'),
      articles: articleResults,
      recovered,
    };
    logger.info(result, 'news_enhancement.completed');
    return result;
  }

  async enhance(article: N8nArticle): Promise<EnhancementOutcome> {
    return (await this.enhanceArticle(article)).outcome;
  }

  async enhanceArticle(article: N8nArticle): Promise<ArticleResult> {
    const subject = {
      articleId: article.id.toString(),
      headline: article.source_headline?.trim() || `Article ${article.id}`,
    };

    try {
      const { systemPrompt, prompt } = buildEnhancementPrompt(article);
      const reply = await this.deps.writeArticle({ articleId: article.id, systemPrompt, prompt });
      const enhanced = parseEnhancement(reply, article);

      if (!enhanced.shouldPublish || enhanced.score < env.NEWS_MIN_SCORE) {
        const reason = rejectionReason(enhanced);
        await n8nArticleRepository.update(article.id, {
          status: 'skipped',
          processing_error: rejectionNote(enhanced),
        });
        logger.info({ ...subject, score: enhanced.score, reason }, 'news_enhancement.rejected');
        return { ...subject, outcome: 'rejected', score: enhanced.score, reason, social: [] };
      }

      const slug = await this.uniqueSlug(enhanced.slug, article.id);
      const cover = await this.deps.drawCover(enhanced.imagePrompt, article.id);
      const coverUrl = await this.deps.storeCover(cover, `${slug}.png`);

      await this.publish(article, enhanced, slug, coverUrl, `${systemPrompt}\n\n---\n\n${prompt}`);
      logger.info({ ...subject, slug, score: enhanced.score }, 'news_enhancement.published');

      const social = await this.draftSocialPosts(article, enhanced, slug, coverUrl);
      return { ...subject, outcome: 'published', score: enhanced.score, reason: null, social };
    } catch (error) {
      const reason = errorMessage(error);
      await n8nArticleRepository.update(article.id, { status: 'failed', processing_error: reason });
      logger.warn({ ...subject, error: reason }, 'news_enhancement.failed');
      return { ...subject, outcome: 'failed', score: null, reason, social: [] };
    }
  }

  private async draftSocialPosts(
    article: N8nArticle,
    enhanced: EnhancedArticle,
    slug: string,
    coverUrl: string
  ): Promise<NewsSocialOutcome[]> {
    if (!this.deps.postToSocial) {
      return [];
    }

    try {
      const source: NewsPostSource = {
        title: enhanced.title,
        summary: enhanced.excerpt || null,
        standfirst: enhanced.standfirst || null,
        category: enhanced.category,
        source: article.creator,
        publishedAt: new Date().toISOString(),
        tags: enhanced.tags,
        articleUrl: articleUrl(
          {
            id: article.id.toString(),
            title: enhanced.title,
            slug,
            excerpt: enhanced.excerpt || null,
            cover_image: coverUrl,
          },
          env.NEWSLETTER_SITE_URL
        ),
        coverUrl,
      };
      const outcomes = await this.deps.postToSocial(source);
      logger.info(
        { title: source.title, outcomes: outcomes.map(o => `${o.status}:${o.reason ?? 'ok'}`) },
        'news_enhancement.social'
      );
      return outcomes;
    } catch (error) {
      const reason = errorMessage(error);
      logger.warn({ title: enhanced.title, error: reason }, 'news_enhancement.social_failed');
      return [{ userId: 'all', groupName: null, status: 'failed', reason }];
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
