import { z } from 'zod';
import {
  animationActionSchema,
  cameraMovementSchema,
  directionSchema,
  emotionSchema,
  shotSizeSchema,
  transitionSchema,
  versionedIdSchema,
} from './common.contract';

export const vector3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const cameraMoveSchema = z.object({
  type: cameraMovementSchema,
  direction: directionSchema.optional(),
  amount: z.number().min(-50).max(50).default(0),
  easing: z.enum(['linear', 'ease_in', 'ease_out', 'ease_in_out']).default('ease_in_out'),
});

export const cameraSchema = z.object({
  shot_size: shotSizeSchema,
  lens_mm: z.number().min(8).max(300).default(50),
  position: vector3Schema.optional(),
  look_at: vector3Schema.optional(),
  focus_target: z.string().max(80).optional(),
  depth_of_field: z.boolean().default(false),
  movement: cameraMoveSchema.default({ type: 'static', amount: 0, easing: 'ease_in_out' }),
});

export const animationCommandSchema = z.object({
  character_id: versionedIdSchema,
  action: animationActionSchema,
  start_time: z.number().min(0),
  duration: z.number().positive().max(120),
  direction: directionSchema.optional(),
  speed: z.number().min(0.1).max(3).default(1),
  target: z.string().max(80).optional(),
  loop: z.boolean().default(false),
});

export const shotCharacterSchema = z.object({
  character_id: versionedIdSchema,
  position: vector3Schema.optional(),
  facing: directionSchema.optional(),
  emotion: emotionSchema.default('neutral'),
  animations: z.array(animationCommandSchema).max(12).default([]),
  speaking_track_id: z.string().max(80).optional(),
});

export const lightingSchema = z.object({
  preset: z.enum(['three_point', 'natural', 'low_key', 'high_key', 'silhouette', 'golden_hour']),
  intensity: z.number().min(0).max(20).default(3),
  colour_kelvin: z.number().min(1000).max(12000).default(5600),
  shadows: z.boolean().default(true),
});

export const shotAudioSchema = z.object({
  narration_track_ids: z.array(z.string()).max(4).default([]),
  dialogue_track_ids: z.array(z.string()).max(8).default([]),
  sfx: z
    .array(z.object({ name: z.string().max(60), at: z.number().min(0) }))
    .max(8)
    .default([]),
  ambience: z.string().max(60).optional(),
});

export const shotSpecSchema = z.object({
  shot_id: z.string().regex(/^shot_\d{3}$/),
  index: z.number().int().min(0),
  duration_seconds: z.number().positive().max(120),
  camera: cameraSchema,
  characters: z.array(shotCharacterSchema).max(8).default([]),
  props: z
    .array(z.object({ prop_id: versionedIdSchema, position: vector3Schema.optional() }))
    .max(12)
    .default([]),
  lighting: lightingSchema.optional(),
  audio: shotAudioSchema.default({ narration_track_ids: [], dialogue_track_ids: [], sfx: [] }),
  transition_out: transitionSchema.default('cut'),
});

export const sceneSpecSchema = z
  .object({
    scene_id: z.string().regex(/^scene_\d{3}$/),
    index: z.number().int().min(0),
    duration_seconds: z.number().positive().max(600),
    environment_id: versionedIdSchema,
    animation_mode: z.enum(['2d', 'hybrid', '3d']),
    background_layers: z
      .array(z.object({ asset_key: z.string(), depth: z.number().min(0).max(1) }))
      .max(8)
      .default([]),
    lighting: lightingSchema.optional(),
    shots: z.array(shotSpecSchema).min(1).max(24),
  })
  .superRefine((scene, ctx) => {
    const total = scene.shots.reduce((sum, shot) => sum + shot.duration_seconds, 0);
    if (Math.abs(total - scene.duration_seconds) > 0.5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['shots'],
        message: `shot durations total ${total}s but the scene is ${scene.duration_seconds}s`,
      });
    }

    scene.shots.forEach((shot, position) => {
      if (shot.index !== position) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['shots', position, 'index'],
          message: `shot index ${shot.index} does not match its position ${position}`,
        });
      }
      for (const character of shot.characters) {
        for (const animation of character.animations) {
          if (animation.start_time + animation.duration > shot.duration_seconds + 0.01) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ['shots', position, 'characters'],
              message:
                `${animation.action} on ${animation.character_id} ` +
                `runs past the end of ${shot.shot_id}`,
            });
          }
        }
      }
    });
  });

export const scenePlanSchema = z.object({
  scenes: z.array(sceneSpecSchema).min(1).max(120),
});

export type Vector3 = z.infer<typeof vector3Schema>;
export type CameraSpec = z.infer<typeof cameraSchema>;
export type AnimationCommand = z.infer<typeof animationCommandSchema>;
export type ShotSpec = z.infer<typeof shotSpecSchema>;
export type SceneSpec = z.infer<typeof sceneSpecSchema>;
export type ScenePlan = z.infer<typeof scenePlanSchema>;
