import { z } from 'zod';
import { shotCharacterSchema, type SceneSpec, type ShotSpec } from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured } from './structured';

const shotAnimationSchema = z.object({
  characters: z.array(shotCharacterSchema).max(8),
});

export interface SpokenLine {
  line_id: string;
  character_id?: string;
  text: string;
  start: number;
  duration: number;
}

export async function directShotAnimation(shot: ShotSpec, lines: SpokenLine[]): Promise<ShotSpec> {
  if (shot.characters.length === 0) {
    return shot;
  }

  const prompt = loadPrompt('animation/animation_director');
  const result = await generateStructured({
    stage: `animation:${shot.shot_id}`,
    schema: shotAnimationSchema,
    prompt: prompt.render({ shot, lines }),
    temperature: 0.4,
  });

  return { ...shot, characters: result.data.characters };
}

export async function directSceneAnimation(
  scene: SceneSpec,
  linesByShot: Record<string, SpokenLine[]>
): Promise<SceneSpec> {
  const shots: ShotSpec[] = [];
  for (const shot of scene.shots) {
    shots.push(await directShotAnimation(shot, linesByShot[shot.shot_id] ?? []));
  }
  return { ...scene, shots };
}

export function animationPromptVersion(): string {
  const prompt = loadPrompt('animation/animation_director');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
