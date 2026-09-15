import { storySchema, type Story } from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

export interface StoryBrief {
  idea: string;
  genre?: string;
  language: string;
  audience?: string;
  visualStyle: string;
  targetDurationSeconds: number;
  contentRestrictions: string[];
}

export async function directStory(brief: StoryBrief): Promise<StructuredResult<Story>> {
  const prompt = loadPrompt('story/director');

  return generateStructured({
    stage: 'story',
    schema: storySchema,
    prompt: prompt.render({
      idea: brief.idea,
      genre: brief.genre ?? 'general',
      language: brief.language,
      audience: brief.audience ?? 'general audience',
      visual_style: brief.visualStyle,
      target_duration_seconds: brief.targetDurationSeconds,
      restrictions: brief.contentRestrictions.length
        ? brief.contentRestrictions.join(', ')
        : 'none beyond platform policy',
    }),
    temperature: 0.8,
  });
}

export function storyPromptVersion(): string {
  const prompt = loadPrompt('story/director');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
