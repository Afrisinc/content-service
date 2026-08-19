import { POST_ARC, CONTACT, MAX_HEADLINE_LINES } from '@/brand/afrisinc.brand';
import {
  PostCopy,
  PostCopySlide,
  PostFormatName,
  PostSlideSpec,
  PostSpec,
  PostSurface,
} from '@/types/post.types';

export const SLUG_MAX_LENGTH = 48;

export function buildPostSlug(topic: string, createdAt: Date = new Date()): string {
  const base = topic
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH - 7);
  const stamp = createdAt.getTime().toString(36).slice(-6);
  return `${base || 'carousel'}-${stamp}`;
}

function surfaceForRole(
  slide: PostCopySlide,
  index: number,
  total: number,
  photosByIndex: Record<number, string>
): PostSurface {
  // A lone frame gets a photograph when one was assigned; the arc does not apply.
  if (total === 1) {
    return photosByIndex[index] ? 'photo' : 'azure';
  }

  const byRole = POST_ARC.find(entry => entry.role === slide.role);
  if (byRole) {
    return byRole.surface;
  }
  if (index === 0 || index === total - 1) {
    return 'azure';
  }
  return index % 2 === 1 ? 'photo' : 'white';
}

function strikeLineIndex(headline: string[], word?: string): number | null {
  if (!word) {
    return null;
  }
  const needle = word.toLowerCase().replace(/[.,]/g, '');
  const found = headline.findIndex(line => line.toLowerCase().includes(needle));
  return found >= 0 ? found : null;
}

/**
 * Turns agent copy plus a photo assignment into the render contract.
 *
 * Two decisions are settled here rather than at each call site: the coral budget
 * (a claim eyebrow and a strike-through cannot both appear, so the eyebrow wins)
 * and the domain (a CTA pill carries it, which is why `cta` and the header site
 * are mutually exclusive downstream).
 */
export function buildPostSpecFromCopy(
  slug: string,
  copy: PostCopy,
  photosByIndex: Record<number, string>,
  format: PostFormatName = 'post'
): PostSpec {
  const total = copy.slides.length;

  const slides: PostSlideSpec[] = copy.slides.map((slide, index) => {
    const surface = surfaceForRole(slide, index, total, photosByIndex);
    const isClaim = slide.eyebrowKind === 'claim';
    const headline = slide.headline.slice(0, MAX_HEADLINE_LINES);
    const strike = isClaim ? null : strikeLineIndex(headline, slide.strikeWord);

    const spec: PostSlideSpec = {
      surface,
      headline,
      eyebrow: { text: slide.eyebrow, kind: slide.eyebrowKind },
    };

    if (surface === 'photo') {
      spec.photo = photosByIndex[index];
      // A 9:16 crop keeps far less of a landscape frame, so a story leans on a
      // deeper scrim to hold the headline against whatever survives the crop.
      if (format === 'story') {
        spec.dense_scrim = true;
      }
    }
    if (strike !== null) {
      spec.strike_line = strike;
    }
    if (slide.subs?.length) {
      spec.subs = slide.subs.slice(0, 2);
    }
    if (surface === 'white' && slide.rows?.length) {
      spec.rows = slide.rows.slice(0, 3);
      if (slide.closing) {
        spec.closing = slide.closing;
      }
    }
    if (slide.cta) {
      spec.cta = { text: slide.cta || CONTACT.site, arrow: true };
    }

    return spec;
  });

  return { slug, format, slides };
}

/** Every contact route, appended to the caption where they are actually tappable. */
export function buildCaptionFooter(): string {
  return [
    `Call or WhatsApp → ${CONTACT.phonePrimary} or ${CONTACT.phoneSecondary}`,
    `Email → ${CONTACT.email}`,
    `Online → ${CONTACT.site}`,
  ].join('\n');
}

export function buildFullCaption(copy: PostCopy): string {
  const hashtags = copy.hashtags.join(' ');
  return [copy.caption.trim(), buildCaptionFooter(), hashtags].filter(Boolean).join('\n\n');
}
