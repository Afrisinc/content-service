import { z } from 'zod';
import { slugSchema, transitionSchema, versionedIdSchema } from './common.contract';

export const storyBeatSchema = z.enum([
  'setup',
  'inciting_incident',
  'rising_action',
  'midpoint',
  'complication',
  'climax',
  'resolution',
  'payoff',
]);

export const dialogueLineSchema = z.object({
  line_id: z.string().min(3).max(40),
  character_id: versionedIdSchema,
  text: z.string().min(1).max(400),
  emotion: z.string().max(40).default('neutral'),
});

export const narrationLineSchema = z.object({
  line_id: z.string().min(3).max(40),
  text: z.string().min(1).max(600),
  emotion: z.string().max(40).default('neutral'),
});

export const storySceneSchema = z.object({
  scene_id: z.string().regex(/^scene_\d{3}$/),
  index: z.number().int().min(0),
  beat: storyBeatSchema,
  synopsis: z.string().min(10).max(400),
  environment_id: versionedIdSchema,
  character_ids: z.array(versionedIdSchema).max(8).default([]),
  duration_seconds: z.number().positive().max(120),
  narration: z.array(narrationLineSchema).max(6).default([]),
  dialogue: z.array(dialogueLineSchema).max(12).default([]),
  transition_in: transitionSchema.default('cut'),
  transition_out: transitionSchema.default('cut'),
  sfx: z.array(z.string().max(60)).max(8).default([]),
  ambience: z.string().max(60).optional(),
});

export const storySchema = z
  .object({
    story_id: z.string().min(3).max(80),
    title: z.string().min(2).max(120),
    logline: z.string().min(10).max(300),
    synopsis: z.string().min(20).max(2000),
    genre: z.string().min(2).max(60),
    language: z.string().min(2).max(12).default('en'),
    audience: z.string().max(80).optional(),
    themes: z.array(z.string().max(60)).max(6).default([]),
    music_direction: z.string().max(200).optional(),
    target_duration_seconds: z.number().int().positive().max(1800),
    character_slugs: z.array(slugSchema).min(1).max(12),
    environment_slugs: z.array(slugSchema).min(1).max(10),
    scenes: z.array(storySceneSchema).min(1).max(120),
  })
  .superRefine((story, ctx) => {
    const total = story.scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
    const drift = Math.abs(total - story.target_duration_seconds);
    if (drift > Math.max(3, story.target_duration_seconds * 0.15)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['scenes'],
        message:
          `scene durations total ${total}s but the target is ` +
          `${story.target_duration_seconds}s`,
      });
    }

    const seen = new Set<string>();
    story.scenes.forEach((scene, position) => {
      if (seen.has(scene.scene_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', position, 'scene_id'],
          message: `duplicate scene_id ${scene.scene_id}`,
        });
      }
      seen.add(scene.scene_id);
      if (scene.index !== position) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes', position, 'index'],
          message: `scene index ${scene.index} does not match its position ${position}`,
        });
      }
    });

    const beats = new Set(story.scenes.map(scene => scene.beat));
    for (const required of ['setup', 'climax', 'resolution'] as const) {
      if (!beats.has(required)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['scenes'],
          message: `story has no ${required} beat`,
        });
      }
    }
  });

export type StoryBeat = z.infer<typeof storyBeatSchema>;
export type DialogueLine = z.infer<typeof dialogueLineSchema>;
export type NarrationLine = z.infer<typeof narrationLineSchema>;
export type StoryScene = z.infer<typeof storySceneSchema>;
export type Story = z.infer<typeof storySchema>;
