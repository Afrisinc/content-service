import { characterBibleListSchema, type CharacterBibleList, type Story } from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

export async function directCharacters(
  story: Story,
  visualStyle: string
): Promise<StructuredResult<CharacterBibleList>> {
  const prompt = loadPrompt('characters/character_director');

  return generateStructured({
    stage: 'characters',
    schema: characterBibleListSchema,
    prompt: prompt.render({
      story: {
        title: story.title,
        logline: story.logline,
        synopsis: story.synopsis,
        genre: story.genre,
        audience: story.audience,
        scenes: story.scenes.map(scene => ({
          scene_id: scene.scene_id,
          synopsis: scene.synopsis,
          character_ids: scene.character_ids,
        })),
      },
      character_slugs: story.character_slugs,
      visual_style: visualStyle,
    }),
    temperature: 0.6,
  });
}

export function characterPromptVersion(): string {
  const prompt = loadPrompt('characters/character_director');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
