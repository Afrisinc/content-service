import type { NotifyCampaignRequest } from '@/adapters/notify/notify.types';

export interface DigestArticle {
  id: string;
  title: string | null;
  slug: string | null;
  excerpt: string | null;
  cover_image: string | null;
}

export interface DigestContext {
  articles: DigestArticle[];
  articlesSummary: string;
  today: string;
  isoDate: string;
  articleIds: string[];
}

const SYSTEM_PROMPT =
  'You are an email designer for Afrisinc Media. Generate clean, mobile-responsive HTML email ' +
  'newsletters. Return ONLY the complete HTML document, no markdown, no backticks.';

export function articleUrl(article: DigestArticle, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/media/articles/${article.slug || article.id}`;
}

export function buildDigestContext(
  articles: DigestArticle[],
  options: { siteUrl: string; limit: number; now?: Date }
): DigestContext {
  const now = options.now ?? new Date();
  const selected = articles.slice(0, options.limit);

  const articlesSummary = selected
    .map((article, index) =>
      [
        `${index + 1}. Title: ${article.title ?? ''}`,
        `   Excerpt: ${article.excerpt ?? ''}`,
        `   URL: ${articleUrl(article, options.siteUrl)}`,
        `   Image: ${article.cover_image ?? ''}`,
      ].join('\n')
    )
    .join('\n\n');

  return {
    articles: selected,
    articlesSummary,
    today: now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    }),
    isoDate: now.toISOString().slice(0, 10),
    articleIds: selected.map(article => article.id),
  };
}

/** The layout brief is part of the contract with the design, so it lives here, not inline. */
export function buildDigestPrompt(context: DigestContext): {
  systemPrompt: string;
  prompt: string;
} {
  return {
    systemPrompt: SYSTEM_PROMPT,
    prompt: [
      'Generate a complete mobile-responsive HTML email newsletter for Afrisinc Media ' +
        `for ${context.today}.`,
      '',
      'Articles:',
      context.articlesSummary,
      '',
      'Requirements:',
      "- Dark header: background #1a1a2e, text white, title 'Afrisinc Media Daily'",
      '- Date subtitle below title',
      '- Each article: title (bold), excerpt, cover image (if available), ' +
        'orange CTA button linking to article URL',
      '- Inline CSS only',
      '- Max width 600px',
      '- Mobile responsive',
      '- Orange accent color: #f97316',
      '- Footer with unsubscribe placeholder: [UNSUBSCRIBE_LINK]',
      '- Professional clean layout',
    ].join('\n'),
  };
}

/**
 * Models wrap HTML in a markdown fence often enough that trusting the instruction alone
 * ships broken emails. Strip it rather than send the fence to subscribers.
 */
export function extractHtml(content: string): string {
  const fenced = content.match(/```(?:html)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : content).trim();
}

export function digestSubject(isoDate: string): string {
  return `Afrisinc Media Daily — ${isoDate}`;
}

export const DIGEST_PREVIEW_TEXT = 'Your top African business & tech stories today';
export const DIGEST_TYPE = 'newsletter_digest';

export function buildCampaignPayload(input: {
  subject: string;
  html: string;
  recipientTags: string[];
  scheduledAt: Date;
}): NotifyCampaignRequest {
  return {
    name: input.subject,
    channel: 'EMAIL',
    recipientType: 'tags',
    recipientTags: input.recipientTags,
    status: 'scheduled',
    scheduledAt: input.scheduledAt.toISOString(),
    subject: input.subject,
    html_content: input.html,
    type: DIGEST_TYPE,
  };
}
