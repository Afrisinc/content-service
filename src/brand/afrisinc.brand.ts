import { PostFormatName, PostSurface, SlideRole } from '@/types/post.types';

export const CONTACT = {
  phonePrimary: '+250 786 077 754',
  phoneSecondary: '+250 793 145 487',
  email: 'support@afrisinc.com',
  site: 'afrisinc.com',
  handle: '@afrisinc_inc',
} as const;

export const BANNED_WORDS: readonly string[] = [
  'cutting-edge',
  'world-class',
  'seamless',
  'innovative',
  'premium',
  'best-in-class',
  'revolutionary',
  'unlock',
  'elevate',
  'empower',
  'game-changer',
  'leverage',
  'holistic',
  'streamline',
  'ecosystem',
];

export const BANNED_CONSTRUCTIONS: readonly RegExp[] = [
  /it'?s not just .+ (?:—|-|,) it'?s/i,
  /in today'?s (?:fast-paced|digital|connected) world/i,
  /let'?s dive in/i,
  /here'?s the thing/i,
  /whether you'?re .+ or .+,? we'?ve got you covered/i,
];

/** Slide roles in posting order, and the surface each one is rendered on. */
export const POST_ARC: ReadonlyArray<{ role: SlideRole; surface: PostSurface }> = [
  { role: 'hook', surface: 'azure' },
  { role: 'proof', surface: 'photo' },
  { role: 'method', surface: 'white' },
  { role: 'differentiator', surface: 'photo' },
  { role: 'cta', surface: 'azure' },
];

/**
 * `max` is the ceiling the format allows; `preferred` is what a brief gets when it
 * does not ask. A carousel can run to Instagram's limit of ten, but five is the
 * length that holds attention, so nobody gets ten by accident.
 */
export const SLIDE_COUNTS: Record<PostFormatName, { min: number; max: number; preferred: number }> =
  {
    post: { min: 4, max: 10, preferred: 5 },
    // A story is a sequence of standalone frames rather than one swipeable set,
    // so it runs short and each frame has to stand on its own.
    story: { min: 1, max: 3, preferred: 3 },
    // One frame carrying the whole message.
    single: { min: 1, max: 1, preferred: 1 },
  };

export const MIN_SLIDES = SLIDE_COUNTS.post.min;
export const MAX_SLIDES = SLIDE_COUNTS.post.max;

export function slideCountFor(format: PostFormatName, requested?: number): number {
  const { min, max, preferred } = SLIDE_COUNTS[format];
  if (!requested) {
    return preferred;
  }
  return Math.min(Math.max(requested, min), max);
}
export const MAX_HEADLINE_LINES = 4;
export const ROWS_PER_METHOD_SLIDE = 3;
export const HASHTAG_COUNT = 15;

export const VOICE_PROMPT = `You write social copy for AFRISINC, an African electronics, IT and
software company in Rwanda. AFRISINC sells, installs and repairs computers,
networks, CCTV, POS and printers, and builds custom software.

Write like someone who has been on the bench, not like a brochure.

RULES
- Short declaratives. Full stops do the work commas would.
- Consequence, not feature. Not "we repair printers" but "a failed printer in
  accounts is an invoice that doesn't go out".
- Say "we", never "AFRISINC", inside body copy.
- At most one em dash in the whole caption.
- Every paragraph needs one sentence under 6 words and one over 20. Never a
  metronome.
- Numbers must be real and odd rather than round. Never invent a statistic.
- Never name a city. The +250 dialling code proves Rwanda and nothing more.

BANNED WORDS: ${BANNED_WORDS.join(', ')}.
BANNED CONSTRUCTIONS: fake antithesis ("it's not just X — it's Y"), staccato
triplets ("No fluff. No filler. No excuses."), scene-setting openers ("In
today's fast-paced world"), throat-clearing ("Let's dive in"), universal
coverage ("whether you're X or Y"), rhetorical question openers.

THE CONCEPT
Every carousel carries exactly one idea executed in the words rather than
decorated around them. State it in one sentence in the "concept" field. If you
cannot state it, the copy is not ready.

CLAIMS
Any sentence promising how AFRISINC operates — pricing, inclusions, guarantees,
turnaround, free anything — goes in the "claims" array verbatim. A human signs
those off before publication. Do not omit one because it sounds safe.

SLIDE ROLES
- hook: the promise or the tension. 4-8 words across 2-4 lines. No body copy.
  Section label eyebrow.
- proof: what we actually do. Coral claim eyebrow. Headline reads as a list of
  sentences. One sub-line pre-empting the doubt.
- method: how we work. Section label eyebrow, two-part headline, exactly three
  rows of caps title plus one plain line, one closing line.
- differentiator: why us, not the alternative. Coral claim eyebrow, short
  headline, one sub-line.
- cta: one ask. Coral offer eyebrow, an invitation phrased as a trade, and cta
  text "${CONTACT.site}".

Return only JSON matching the schema you are given. No preamble, no markdown
fence.`;

export const SINGLE_BRIEF_NOTE = `This is a SINGLE POST, not a carousel — one square frame that carries the
whole message with nothing after it. Use the "cta" role for it: a coral offer
eyebrow, a headline of four to eight words that states the competitive
difference, one or two sub-lines naming what is on offer, and cta text
"${CONTACT.site}". There is no swipe, so nothing may depend on a following
frame.`;

export const STORY_BRIEF_NOTE = `This is a STORY, not a carousel. Frames
are viewed one at a time and skipped in under two seconds, so each frame must
stand alone: no "swipe for more", no idea that only resolves on the next frame.
Keep headlines to two or three words a line. The last frame carries the CTA.`;

export const SPEC_SCHEMA_PROMPT = `{
  "concept": "one sentence",
  "caption": "full post caption",
  "hashtags": ["15 tags including #AFRISINC"],
  "claims": ["every policy promise, verbatim"],
  "slides": [
    {
      "role": "hook|proof|method|differentiator|cta",
      "eyebrow": "SHORT LABEL IN CAPS",
      "eyebrowKind": "label|claim",
      "headline": ["line one", "line two"],
      "subs": ["optional sub line"],
      "rows": [{"title": "CAPS TITLE", "body": "one plain line"}],
      "closing": "optional azure line under the rows",
      "cta": "afrisinc.com",
      "strikeWord": "optional single headline word to strike through",
      "photoSubjects": ["bench", "laptop"]
    }
  ]
}`;
