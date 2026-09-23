export const NEWS_CATEGORIES = [
  'technology',
  'fintech',
  'business',
  'startup',
  'ai',
  'infrastructure',
  'policy',
  'culture',
  'general',
] as const;

export interface EnhancementSource {
  id: bigint;
  source_headline: string | null;
  source_summary: string | null;
  source_url: string;
  category: string | null;
  creator: string | null;
  pub_date: Date | null;
}

export interface EnhancedArticle {
  score: number;
  shouldPublish: boolean;
  rejectReason: string | null;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string[];
  category: string;
  topic: string | null;
  metaTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogDescription: string;
  twitterTitle: string;
  twitterDescription: string;
  coverAlt: string;
  imagePrompt: string;
  wordCount: number;
  readTime: number;
}

const WORDS_PER_MINUTE = 200;
const MIN_CONTENT_WORDS = 150;

const ALLOWED_TAGS = new Set([
  'h2',
  'h3',
  'p',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'b',
  'i',
  'blockquote',
  'a',
  'br',
]);

export function buildEnhancementPrompt(article: EnhancementSource) {
  const systemPrompt = [
    'You are the senior editor of Afrisinc Media, an African business and technology',
    'news publication.',
    '',
    'You receive one raw news item from an RSS feed. First judge it, then, only if it is',
    'worth publishing, rewrite it as an original Afrisinc Media article.',
    '',
    'Scoring (0 to 1): how relevant and valuable the story is to African founders,',
    'operators and investors. Score below 0.6 and set should_publish=false for: stories',
    'with no African business, technology, economic or policy angle; celebrity, sport or',
    'crime items; press-release fluff; items too thin to write 500 words about honestly.',
    '',
    'Rules for the article:',
    '- Never invent facts, numbers, quotes or names that are not in the source. Where the',
    '  source is thin, add context and analysis, clearly framed as such.',
    '- Credit the original source by name in the body.',
    '- "content" is HTML using only <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>,',
    '  <blockquote>. No <h1>, no inline styles, no scripts, no images. 500 to 800 words.',
    '- The cover image prompt describes a photorealistic African business or technology',
    '  scene. No text, no logos, no identifiable real people.',
    '',
    'Respond with ONLY a JSON object with exactly these fields:',
    '{',
    '  "score": 0.0,',
    '  "should_publish": true,',
    '  "reject_reason": "why it was rejected, or null",',
    '  "title": "headline, max 80 characters",',
    '  "slug": "kebab-case-url-slug, max 60 characters",',
    '  "excerpt": "2-3 sentence hook, max 300 characters",',
    '  "content": "<h2>…</h2><p>…</p>",',
    '  "tags": ["3 to 6 short tags"],',
    `  "category": "one of: ${NEWS_CATEGORIES.join(', ')}",`,
    '  "topic": "broad topic bucket, e.g. finance",',
    '  "meta_title": "max 60 characters",',
    '  "meta_description": "max 155 characters",',
    '  "og_title": "max 90 characters",',
    '  "og_description": "max 200 characters",',
    '  "twitter_title": "max 70 characters",',
    '  "twitter_description": "max 200 characters",',
    '  "cover_alt": "alt text for the cover image, max 125 characters",',
    '  "image_prompt": "DALL-E 3 prompt"',
    '}',
  ].join('\n');

  const prompt = [
    `Headline: ${article.source_headline ?? '(none)'}`,
    `Summary: ${article.source_summary ?? '(none)'}`,
    `Source: ${article.creator ?? 'unknown'}`,
    `Feed category: ${article.category ?? 'general'}`,
    `Published: ${article.pub_date ? article.pub_date.toISOString() : 'unknown'}`,
    `Original URL: ${article.source_url}`,
  ].join('\n');

  return { systemPrompt, prompt };
}

export function slugify(value: string, maxLength = 60): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, maxLength)
    .replace(/^-+|-+$/g, '');
}

function safeHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * The website renders the body with innerHTML, so what the model returns is
 * reduced to a fixed set of formatting tags: every attribute is dropped except a
 * plain http(s) href on links, and anything else loses its tag but keeps its text.
 */
export function sanitizeArticleHtml(html: string): string {
  return html
    .replace(/<(script|style|iframe|object|embed|svg|math)[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(
      /<(\/?)([a-z][a-z0-9]*)\b([^>]*)>/gi,
      (_match, closing: string, rawTag: string, rest: string) => {
        const tag = rawTag.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          return '';
        }
        if (closing) {
          return tag === 'br' ? '' : `</${tag}>`;
        }
        if (tag === 'a') {
          const href = /href\s*=\s*["']([^"']*)["']/i.exec(rest)?.[1];
          const safe = href ? safeHref(href) : null;
          return safe ? `<a href="${safe}" rel="noopener noreferrer nofollow">` : '<a>';
        }
        return `<${tag}>`;
      }
    )
    .replace(/<(?!\/?(?:h2|h3|p|ul|ol|li|strong|em|b|i|blockquote|a|br)[\s>])/gi, '&lt;')
    .trim();
}

export function countWords(html: string): number {
  const text = html.replace(/<[^>]+>/g, ' ').trim();
  return text ? text.split(/\s+/).length : 0;
}

function str(value: unknown, maxLength: number, fallback = ''): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return (text || fallback).slice(0, maxLength).trim();
}

function tagsFrom(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const entry of value) {
    const tag = typeof entry === 'string' ? entry.replace(/^#/, '').trim().slice(0, 30) : '';
    if (tag && !seen.has(tag.toLowerCase())) {
      seen.add(tag.toLowerCase());
      tags.push(tag);
    }
  }
  return tags.slice(0, 8);
}

function categoryFrom(value: unknown, fallback: string | null): string {
  const candidate = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if ((NEWS_CATEGORIES as readonly string[]).includes(candidate)) {
    return candidate;
  }
  const feedCategory = fallback?.trim().toLowerCase() ?? '';
  return feedCategory || 'general';
}

/**
 * Turns the model's JSON into a publishable article or throws with a reason the
 * editor can act on. A rejection is not an error — it comes back with
 * `shouldPublish: false` and the model's reason.
 */
export function parseEnhancement(raw: unknown, source: EnhancementSource): EnhancedArticle {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('the model did not return a JSON object');
  }
  const reply = raw as Record<string, unknown>;

  const score = typeof reply.score === 'number' ? reply.score : Number(reply.score);
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error('the model returned no valid relevance score');
  }

  const shouldPublish = reply.should_publish === true;
  const reason = str(reply.reject_reason, 500);
  const rejectReason = reason && reason.toLowerCase() !== 'null' ? reason : null;
  const title = str(reply.title, 200, source.source_headline ?? '');
  const content = sanitizeArticleHtml(typeof reply.content === 'string' ? reply.content : '');
  const wordCount = countWords(content);

  if (shouldPublish) {
    if (title.length < 5) {
      throw new Error('the model returned no usable headline');
    }
    if (wordCount < MIN_CONTENT_WORDS) {
      throw new Error(`the rewritten article is too short (${wordCount} words)`);
    }
  }

  const excerpt = str(reply.excerpt, 300);
  const metaDescription = str(reply.meta_description, 155, excerpt);

  return {
    score,
    shouldPublish,
    rejectReason,
    title,
    slug: slugify(str(reply.slug, 100) || title) || `article-${source.id.toString()}`,
    excerpt,
    content,
    tags: tagsFrom(reply.tags),
    category: categoryFrom(reply.category, source.category),
    topic: str(reply.topic, 50) || null,
    metaTitle: str(reply.meta_title, 60, title),
    metaDescription,
    ogTitle: str(reply.og_title, 90, title),
    ogDescription: str(reply.og_description, 200, metaDescription),
    twitterTitle: str(reply.twitter_title, 70, title),
    twitterDescription: str(reply.twitter_description, 200, metaDescription),
    coverAlt: str(reply.cover_alt, 125, title),
    imagePrompt: str(
      reply.image_prompt,
      3500,
      `Professional photorealistic African business and technology scene illustrating: ${title}`
    ),
    wordCount,
    readTime: Math.max(1, Math.ceil(wordCount / WORDS_PER_MINUTE)),
  };
}
