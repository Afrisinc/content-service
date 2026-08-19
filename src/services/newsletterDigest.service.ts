import { notifyClient } from '@/adapters/notify/notifyClient';
import { nodeServices } from '@/adapters/nodes/nodeServices';
import { env } from '@/config/env';
import {
  buildCampaignPayload,
  buildDigestContext,
  buildDigestPrompt,
  digestSubject,
  extractHtml,
  type DigestArticle,
} from '@/helpers/newsletterDigest.helper';
import { chatGptCredentialsFromEnv, runChatGpt } from '@/nodes';
import { mediaPostRepository } from '@/repositories/mediaPost.repository';
import { logger } from '@/utils/logger';

export interface DigestRunOptions {
  /** Generate the email without handing it to Notify. */
  dryRun?: boolean;
}

export interface DigestRunResult {
  status: 'sent' | 'skipped' | 'dry-run';
  reason?: string;
  notifyCampaignId?: string | null;
  subject?: string;
  articleIds?: string[];
  scheduledAt?: string;
  html?: string;
}

class NewsletterDigestService {
  /**
   * Top articles → prepared digest → HTML email → Notify.
   *
   * Notify owns newsletters: subscribers, sending, unsubscribes and delivery metrics all live
   * there, so nothing about the campaign is stored on this side.
   */
  async run(options: DigestRunOptions = {}): Promise<DigestRunResult> {
    const now = new Date();

    const articles = (await mediaPostRepository.getTopArticles({
      status: 'PUBLISHED',
      sortBy: 'views',
      sortOrder: 'desc',
      // Fetching fewer than the minimum would make the guard below unsatisfiable.
      limit: Math.max(env.NEWSLETTER_ARTICLE_LIMIT, env.NEWSLETTER_MIN_ARTICLES),
      publishedAfter: '7d',
    })) as DigestArticle[];

    if (articles.length < env.NEWSLETTER_MIN_ARTICLES) {
      logger.info(
        { found: articles.length, required: env.NEWSLETTER_MIN_ARTICLES },
        'Not enough articles for a digest'
      );
      return { status: 'skipped', reason: 'not-enough-articles' };
    }

    const context = buildDigestContext(articles, {
      siteUrl: env.NEWSLETTER_SITE_URL,
      limit: env.NEWSLETTER_ARTICLE_LIMIT,
      now,
    });
    const { systemPrompt, prompt } = buildDigestPrompt(context);

    const items = await runChatGpt({
      credentials: chatGptCredentialsFromEnv(),
      logger,
      services: nodeServices,
      // One paid generation per day: a retry replays the first result rather than paying again.
      idempotency: { key: `newsletter-digest:${context.isoDate}` },
      usageContext: { requestId: `newsletter-digest:${context.isoDate}` },
      parameters: {
        resource: 'text',
        operation: 'message',
        model: env.NEWSLETTER_DIGEST_MODEL,
        systemPrompt,
        prompt,
        options: { temperature: 0.6, maxTokens: 8000 },
      },
    });

    const html = extractHtml(String(items[0]?.json?.content ?? ''));

    if (!html) {
      throw new Error('The model returned no HTML for the newsletter digest');
    }

    const subject = digestSubject(context.isoDate);
    const scheduledAt = new Date(now.getTime() + env.NEWSLETTER_SEND_DELAY_MINUTES * 60 * 1000);

    if (options.dryRun) {
      logger.info({ subject }, 'Digest generated, nothing sent');
      return { status: 'dry-run', subject, articleIds: context.articleIds, html };
    }

    const campaign = await notifyClient.createCampaign(
      buildCampaignPayload({
        subject,
        html,
        recipientTags: env.NEWSLETTER_RECIPIENT_TAGS,
        scheduledAt,
      })
    );

    logger.info(
      { notifyCampaignId: campaign?.id, subject, articles: context.articleIds.length },
      'Newsletter digest handed to Notify'
    );

    return {
      status: 'sent',
      notifyCampaignId: campaign?.id ?? null,
      subject,
      articleIds: context.articleIds,
      scheduledAt: scheduledAt.toISOString(),
    };
  }
}

export const newsletterDigestService = new NewsletterDigestService();
