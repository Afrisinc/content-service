import {
  shotPromptListSchema,
  type CharacterBible,
  type EnvironmentBible,
  type SceneSpec,
  type ShotPromptList,
} from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

const BASE_NEGATIVE = [
  'blurry',
  'low quality',
  'watermark',
  'text',
  'subtitles',
  'logo',
  'distorted face',
  'extra fingers',
  'deformed hands',
  'duplicated limbs',
  'jitter',
  'flicker',
  'split screen',
].join(', ');

export function describeCharacter(character: CharacterBible): string {
  const appearance = character.appearance;
  return [
    character.name,
    character.age ? `${character.age} years old` : '',
    character.gender_presentation ?? '',
    `${appearance.hair} hair`,
    `${appearance.eyes} eyes`,
    `${appearance.skin} skin`,
    appearance.build ? `${appearance.build} build` : '',
    `wearing ${appearance.clothing}`,
    ...appearance.distinguishing_features,
  ]
    .filter(Boolean)
    .join(', ');
}

export function describeEnvironment(environment: EnvironmentBible): string {
  return [
    environment.name,
    environment.description,
    `${environment.time_of_day}`,
    `${environment.weather} weather`,
    environment.mood ?? '',
    environment.key_light ? `lit by ${environment.key_light}` : '',
  ]
    .filter(Boolean)
    .join(', ');
}

export function mergeNegative(extra?: string): string {
  const additions = (extra ?? '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);
  return [...new Set([...BASE_NEGATIVE.split(', '), ...additions])].join(', ');
}

export async function directShotPrompts(input: {
  scene: SceneSpec;
  characters: CharacterBible[];
  environment: EnvironmentBible | null;
  visualStyle: string;
  clipSeconds: number;
}): Promise<StructuredResult<ShotPromptList>> {
  const prompt = loadPrompt('animation/video_prompt');
  const cast = new Map(
    input.characters.map(character => [character.character_id, character] as const)
  );

  const shots = input.scene.shots.map(shot => ({
    shot_id: shot.shot_id,
    duration_seconds: shot.duration_seconds,
    shot_size: shot.camera.shot_size,
    lens_mm: shot.camera.lens_mm,
    movement: shot.camera.movement.type,
    direction: shot.camera.movement.direction,
    characters: shot.characters.map(entry => ({
      character_id: entry.character_id,
      emotion: entry.emotion,
      actions: entry.animations.map(animation => animation.action),
    })),
  }));

  const result = await generateStructured({
    stage: `video-prompts:${input.scene.scene_id}`,
    schema: shotPromptListSchema,
    prompt: prompt.render({
      shot: shots,
      clip_seconds: input.clipSeconds,
      characters: input.scene.shots
        .flatMap(shot => shot.characters.map(entry => cast.get(entry.character_id)))
        .filter((character): character is CharacterBible => Boolean(character))
        .map(character => ({
          character_id: character.character_id,
          description: describeCharacter(character),
        })),
      environment: input.environment ? describeEnvironment(input.environment) : 'unspecified',
      visual_style: input.visualStyle,
    }),
    temperature: 0.5,
  });

  return {
    ...result,
    data: {
      shots: result.data.shots.map(shot => ({
        ...shot,
        negative_prompt: mergeNegative(shot.negative_prompt),
      })),
    },
  };
}

export function videoPromptVersion(): string {
  const prompt = loadPrompt('animation/video_prompt');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
