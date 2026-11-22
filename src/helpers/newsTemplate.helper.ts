import { seedFrom } from '@/helpers/composition.helper';
import type { HeadlineFitInput, NewsTemplateName } from '@/types/post.types';

const BREAKING_POOL: ReadonlyArray<NewsTemplateName> = [
  'news.bulletin',
  'news.breaking',
  'news.classic',
];
const SPORT_POOL: ReadonlyArray<NewsTemplateName> = [
  'news.spotlight',
  'news.classic',
  'news.duotone',
];
const BUSINESS_POOL: ReadonlyArray<NewsTemplateName> = [
  'news.frame',
  'news.split',
  'news.broadsheet',
];
const GENERAL_POOL: ReadonlyArray<NewsTemplateName> = [
  'news.classic',
  'news.split',
  'news.duotone',
  'news.frame',
  'news.broadsheet',
];

const POOLS: ReadonlyArray<{ pattern: RegExp; pool: ReadonlyArray<NewsTemplateName> }> = [
  { pattern: /break|live|urgent|alert|flash/i, pool: BREAKING_POOL },
  { pattern: /sport|football|soccer|athletic|culture|entertain|music|film|art/i, pool: SPORT_POOL },
  {
    pattern: /business|econom|financ|fintech|market|tech|startup|invest|trade|explain/i,
    pool: BUSINESS_POOL,
  },
];

export function newsTemplatePool(category: string | undefined): ReadonlyArray<NewsTemplateName> {
  const label = category ?? '';
  return POOLS.find(entry => entry.pattern.test(label))?.pool ?? GENERAL_POOL;
}

/**
 * The category's templates, starting at a point fixed by the slug. A slug is
 * stable for the life of a draft, so a re-render keeps the approved design while
 * consecutive stories walk through the whole pool.
 */
export function newsTemplateCandidates(
  category: string | undefined,
  slug: string
): NewsTemplateName[] {
  const pool = newsTemplatePool(category);
  const start = seedFrom(slug) % pool.length;
  return [...pool.slice(start), ...pool.slice(0, start)];
}

export function templateProbe(
  template: NewsTemplateName,
  headline: string[],
  standfirst: string | undefined
): HeadlineFitInput {
  return {
    layout: 'news',
    template,
    headline,
    ...(standfirst ? { subs: [standfirst] } : {}),
  };
}
