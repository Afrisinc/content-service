import type { EditorialBrief, PostCopy, PostSlideSpec, PostSpec } from '@/types/post.types';

export function buildEditorialCopy(brief: EditorialBrief, headlineLines: string[]): PostCopy {
  return {
    concept: brief.headline,
    caption: brief.caption,
    hashtags: brief.hashtags,
    claims: [],
    slides: [
      {
        role: 'hook',
        eyebrow: brief.eyebrow,
        eyebrowKind: 'claim',
        headline: headlineLines,
        ...(brief.standfirst ? { subs: [brief.standfirst] } : {}),
      },
    ],
  };
}

export function buildEditorialSpec(
  slug: string,
  brief: EditorialBrief,
  copy: PostCopy,
  photo: string
): PostSpec {
  const slide = copy.slides[0];
  const spec: PostSlideSpec = {
    surface: 'photo',
    photo,
    layout: brief.layout,
    eyebrow: { text: slide.eyebrow, kind: slide.eyebrowKind },
    headline: slide.headline,
    ...(slide.subs?.length ? { subs: slide.subs } : {}),
    dateline: brief.dateline,
  };

  return { slug, format: 'single', slides: [spec] };
}
