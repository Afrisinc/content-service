import { z } from 'zod';

export const vector3 = z.object({ x: z.number(), y: z.number(), z: z.number() });

export const cameraMove = z.object({
  type: z.enum(['static', 'pan', 'tilt', 'dolly', 'truck', 'crane', 'orbit', 'tracking', 'zoom', 'handheld']),
  direction: z
    .enum(['forward', 'backward', 'left', 'right', 'up', 'down', 'clockwise', 'counter_clockwise'])
    .optional(),
  amount: z.number().default(0),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).default('ease_in_out'),
});

export const camera = z.object({
  shot_size: z.string(),
  lens_mm: z.number().default(50),
  depth_of_field: z.boolean().default(false),
  movement: cameraMove,
});

export const animationCommand = z.object({
  character_id: z.string(),
  action: z.string(),
  start_time: z.number(),
  duration: z.number(),
  direction: z.string().optional(),
  speed: z.number().default(1),
  loop: z.boolean().default(false),
});

export const shotCharacter = z.object({
  character_id: z.string(),
  emotion: z.string().default('neutral'),
  animations: z.array(animationCommand).default([]),
  position: vector3.optional(),
});

export const shot = z.object({
  shot_id: z.string(),
  index: z.number(),
  duration_seconds: z.number(),
  camera,
  characters: z.array(shotCharacter).default([]),
  transition_out: z.string().default('cut'),
});

export const backgroundLayer = z.object({ asset_key: z.string(), depth: z.number() });

export const subtitleCue = z.object({ start: z.number(), end: z.number(), lines: z.array(z.string()) });

export const sceneProps = z.object({
  scene_id: z.string(),
  duration_seconds: z.number(),
  fps: z.number().default(30),
  width: z.number().default(1920),
  height: z.number().default(1080),
  background_layers: z.array(backgroundLayer).default([]),
  character_sources: z.record(z.string()).default({}),
  shots: z.array(shot),
  subtitles: z.array(subtitleCue).default([]),
  audio_src: z.string().optional(),
});

export type SceneProps = z.infer<typeof sceneProps>;
export type ShotProps = z.infer<typeof shot>;
export type CameraProps = z.infer<typeof camera>;
export type AnimationCommandProps = z.infer<typeof animationCommand>;
