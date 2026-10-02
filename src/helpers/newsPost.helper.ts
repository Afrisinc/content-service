import type { EditorialBrief, NewsBrief } from '@/types/post.types';

const MAX_EYEBROW_LENGTH = 48;
const FALLBACK_EYEBROW = 'LATEST';
const MAX_STANDFIRST_LENGTH = 160;
const MAX_HASHTAGS = 4;
const BASE_HASHTAG = '#AfricaBusiness';
const ELLIPSIS = '…';

function words(text: string): string[] {
  return text
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function pascal(text: string): string {
  return words(text)
    .map(word => word[0].toUpperCase() + word.slice(1).toLowerCase())
    .join('');
}

export function newsEyebrow(category: string): string {
  const label = words(category).join(' ').toUpperCase();
  return (label || FALLBACK_EYEBROW).slice(0, MAX_EYEBROW_LENGTH).trimEnd();
}

export function standfirstFrom(summary: string): string {
  const text = summary.replace(/\s+/g, ' ').trim();
  if (text.length <= MAX_STANDFIRST_LENGTH) {
    return text;
  }

  const window = text.slice(0, MAX_STANDFIRST_LENGTH);
  const sentenceEnd = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '));
  if (sentenceEnd >= MAX_STANDFIRST_LENGTH / 2) {
    return window.slice(0, sentenceEnd + 1);
  }

  const wordEnd = window.lastIndexOf(' ');
  const cut = window.slice(0, wordEnd > 0 ? wordEnd : MAX_STANDFIRST_LENGTH);
  return `${cut.replace(/[.,;:\s]+$/, '')}${ELLIPSIS}`;
}

export function newsDateline(source: string | null, publishedAt: string): string {
  const date = new Date(publishedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return source ? `Source: ${source} · ${date}` : date;
}

export function newsHashtags(category: string, tags: string[]): string[] {
  const candidates = [BASE_HASHTAG, category, ...tags]
    .map(entry => (entry.startsWith('#') ? entry : `#${pascal(entry)}`))
    .filter(tag => tag.length > 1);

  return [...new Set(candidates)].slice(0, MAX_HASHTAGS);
}

function sourceLine(news: NewsBrief): string {
  if (!news.sourceUrl) {
    return news.source ? `Source: ${news.source}` : '';
  }
  return news.source
    ? `Source: ${news.source} — original report: ${news.sourceUrl}`
    : `Original report: ${news.sourceUrl}`;
}

export function newsCaption(news: NewsBrief): string {
  const hashtags = newsHashtags(news.category, news.tags).join(' ');

  return [
    news.headline.trim(),
    news.summary.trim(),
    [`Read the full story: ${news.articleUrl}`, sourceLine(news)].filter(Boolean).join('\n'),
    hashtags,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function newsEditorial(news: NewsBrief): EditorialBrief {
  return {
    layout: 'news',
    headline: news.headline,
    standfirst: standfirstFrom(news.standfirst || news.summary),
    eyebrow: newsEyebrow(news.category),
    dateline: newsDateline(news.source, news.publishedAt),
    caption: newsCaption(news),
    hashtags: newsHashtags(news.category, news.tags),
  };
}
