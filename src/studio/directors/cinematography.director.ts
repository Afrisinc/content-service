import {
  sceneSpecSchema,
  type AnimationModeContract,
  type CharacterBible,
  type SceneSpec,
  type StoryScene,
} from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

export async function directScene(
  scene: StoryScene,
  characters: CharacterBible[],
  animationMode: AnimationModeContract
): Promise<StructuredResult<SceneSpec>> {
  const prompt = loadPrompt('cinematography/cinematographer');
  const cast = characters.filter(character => scene.character_ids.includes(character.character_id));

  return generateStructured({
    stage: `cinematography:${scene.scene_id}`,
    schema: sceneSpecSchema,
    prompt: prompt.render({
      scene,
      animation_mode: animationMode,
      characters: cast.map(character => ({
        character_id: character.character_id,
        name: character.name,
        role: character.role,
        supported_actions: character.supported_actions,
        supported_expressions: character.supported_expressions,
      })),
    }),
    temperature: 0.5,
  });
}

export function cinematographyPromptVersion(): string {
  const prompt = loadPrompt('cinematography/cinematographer');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
