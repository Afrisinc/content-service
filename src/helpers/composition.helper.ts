import { PostSlideSpec, PostSurface, SlideAnchor } from '@/types/post.types';

/**
 * Visual variation between posts.
 *
 * Every carousel used to render on the same fixed arc — azure, photo, white,
 * photo, azure — with a dead-centre crop and a default anchor on every frame.
 * The copy changed; the composition never did, so a follower saw the same
 * design over and over.
 *
 * Variation is derived from the post's slug rather than a random number, and
 * this matters: the slug is stable for the life of a draft, so a re-render or a
 * resumed run reproduces the artwork that was approved instead of reshuffling
 * it. Two different posts differ; one post never does.
 *
 * The axes chosen here deliberately do **not** move which slides carry a
 * photograph — art direction decides that, and changing it here would put a
 * photo on a slide that was never assigned one.
 */

/** A cheap, stable string hash. Not for security — only for repeatable variety. */
export function seedFrom(slug: string): number {
  let hash = 2166136261;
  for (let index = 0; index < slug.length; index += 1) {
    hash ^= slug.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** One deterministic stream of numbers per post. */
export function makeVariation(slug: string): () => number {
  let state = seedFrom(slug) || 1;

  return () => {
    // xorshift32: small, dependency-free, and good enough to pick from a list.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

function pick<T>(next: () => number, options: ReadonlyArray<T>): T {
  return options[Math.floor(next() * options.length) % options.length];
}

/** Flat surfaces a non-photo frame can take. `white` is required for row lists. */
const FLAT_SURFACES: ReadonlyArray<PostSurface> = ['azure', 'white'];
const ANCHORS: ReadonlyArray<SlideAnchor> = ['top', 'centre', 'bottom'];
/** Off-centre crops that still keep a subject in frame. */
const PHOTO_FOCUS: ReadonlyArray<number> = [0.35, 0.5, 0.5, 0.65];

export interface SlideVariation {
  surface?: PostSurface;
  anchor: SlideAnchor;
  photoFocus: number;
  coralRule: boolean;
}

/**
 * How one frame differs from the same frame in another post.
 *
 * `surface` is only suggested for a frame that carries neither a photograph nor
 * a row list — moving those would break the render contract.
 */
export function varySlide(
  next: () => number,
  options: { carriesPhoto: boolean; carriesRows: boolean; canTakeCoral: boolean }
): SlideVariation {
  return {
    surface: options.carriesPhoto || options.carriesRows ? undefined : pick(next, FLAT_SURFACES),
    anchor: pick(next, ANCHORS),
    photoFocus: pick(next, PHOTO_FOCUS),
    // Sparingly: the coral rule is an accent, not a habit.
    coralRule: options.canTakeCoral && next() < 0.35,
  };
}

/** Applies a variation to a slide the spec builder has otherwise finished. */
export function applyVariation(spec: PostSlideSpec, variation: SlideVariation): PostSlideSpec {
  const varied: PostSlideSpec = { ...spec, anchor: variation.anchor };

  if (spec.surface === 'photo') {
    varied.photo_focus = variation.photoFocus;
  }
  // The renderer allows one coral element per slide: a rule, a strike, or a
  // claim eyebrow. Never two.
  if (variation.coralRule) {
    varied.coral_rule = true;
  }

  return varied;
}
