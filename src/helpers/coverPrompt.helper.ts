export const IMAGE_SAFETY_RULES =
  'The image must contain no text, lettering, numbers, signage, logos, seals or watermarks ' +
  'anywhere. Any screen, sign or display in the scene must be blank or show abstract shapes ' +
  'only. Prefer a composition with no people. Show no face in close-up or in profile: any ' +
  'person appears only from behind, in silhouette or small in the distance.';

const MAX_PREMISE_LENGTH = 500;

const STORY_COVER_STYLE =
  'Cinematic book-cover illustration with one strong focal point, rich atmospheric lighting ' +
  'and a vertical composition that leaves calm space at the top and bottom for a title.';

export function withImageRules(style: string, prompt: string): string {
  return `${prompt.trim()}\n\n${style} ${IMAGE_SAFETY_RULES}`;
}

export interface StoryCoverSubject {
  premise: string;
  genre: string | null;
  tone: string | null;
}

export function storyCoverPrompt(story: StoryCoverSubject): string {
  const premise = story.premise.replace(/\s+/g, ' ').trim().slice(0, MAX_PREMISE_LENGTH);
  const mood = [story.genre, story.tone].filter(Boolean).join(', ');

  return withImageRules(
    STORY_COVER_STYLE,
    `A cover for a ${story.genre || 'fiction'} story. ${mood ? `Mood: ${mood}. ` : ''}` +
      `Depict one symbolic scene inspired by this premise, ` +
      `without naming anything in it: ${premise}`
  );
}
