import type {
  EditorialBrief,
  NewsTemplateName,
  PostCopy,
  PostFormatName,
  PostSlideSpec,
  PostSpec,
} from '@/types/post.types';

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
  photo: string,
  template?: NewsTemplateName,
  format: PostFormatName = 'single'
): PostSpec {
  const slide = copy.slides[0];
  const spec: PostSlideSpec = {
    surface: 'photo',
    photo,
    layout: brief.layout,
    ...(template ? { template } : {}),
    eyebrow: { text: slide.eyebrow, kind: slide.eyebrowKind },
    headline: slide.headline,
    ...(slide.subs?.length ? { subs: slide.subs } : {}),
    dateline: brief.dateline,
  };

  return { slug, format, slides: [spec] };
}
