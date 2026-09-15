import { environmentBibleListSchema, type EnvironmentBibleList, type Story } from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

export async function directEnvironments(
  story: Story,
  visualStyle: string
): Promise<StructuredResult<EnvironmentBibleList>> {
  const prompt = loadPrompt('environments/environment_director');

  return generateStructured({
    stage: 'environments',
    schema: environmentBibleListSchema,
    prompt: prompt.render({
      story: {
        title: story.title,
        logline: story.logline,
        genre: story.genre,
        scenes: story.scenes.map(scene => ({
          scene_id: scene.scene_id,
          synopsis: scene.synopsis,
          environment_id: scene.environment_id,
        })),
      },
      environment_slugs: story.environment_slugs,
      visual_style: visualStyle,
    }),
    temperature: 0.6,
  });
}

export function environmentPromptVersion(): string {
  const prompt = loadPrompt('environments/environment_director');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
