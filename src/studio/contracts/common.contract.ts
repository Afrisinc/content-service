import { z } from 'zod';

export const SLUG = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
export const VERSIONED_ID = /^[a-z0-9]+(?:[_-][a-z0-9]+)*_v\d+$/;

export const slugSchema = z.string().min(2).max(64).regex(SLUG);
export const versionedIdSchema = z.string().min(4).max(80).regex(VERSIONED_ID);

export const animationModeSchema = z.enum(['2d', 'hybrid', '3d']);
export const renderProfileSchema = z.enum(['preview', 'draft', 'production', 'premium']);
export const variantFormatSchema = z.enum(['16:9', '9:16', '4:5', '1:1']);
export const platformSchema = z.enum([
  'youtube',
  'instagram',
  'facebook',
  'tiktok',
  'linkedin',
  'twitter',
]);

export const shotSizeSchema = z.enum([
  'extreme_wide',
  'wide',
  'medium_wide',
  'medium',
  'medium_close_up',
  'close_up',
  'extreme_close_up',
  'over_the_shoulder',
  'pov',
]);

export const cameraMovementSchema = z.enum([
  'static',
  'pan',
  'tilt',
  'dolly',
  'truck',
  'crane',
  'orbit',
  'tracking',
  'zoom',
  'handheld',
]);

export const directionSchema = z.enum([
  'forward',
  'backward',
  'left',
  'right',
  'up',
  'down',
  'clockwise',
  'counter_clockwise',
]);

export const emotionSchema = z.enum([
  'neutral',
  'happy',
  'sad',
  'angry',
  'scared',
  'surprised',
  'curious',
  'determined',
  'tired',
  'excited',
]);

export const animationActionSchema = z.enum([
  'idle',
  'walk',
  'run',
  'jump',
  'sit',
  'stand',
  'kneel',
  'turn',
  'wave',
  'point',
  'reach',
  'pick_up',
  'look',
  'look_left',
  'look_right',
  'talk',
  'laugh',
  'cry',
  'fall',
  'celebrate',
]);

export const transitionSchema = z.enum([
  'cut',
  'dissolve',
  'fade_in',
  'fade_out',
  'wipe',
  'match_cut',
]);

export const timeOfDaySchema = z.enum([
  'dawn',
  'morning',
  'midday',
  'afternoon',
  'sunset',
  'dusk',
  'night',
]);

export const weatherSchema = z.enum([
  'clear',
  'cloudy',
  'overcast',
  'rain',
  'storm',
  'fog',
  'snow',
  'wind',
]);

export const generatorMetaSchema = z.object({
  provider: z.string(),
  model: z.string(),
  model_version: z.string().optional(),
  prompt: z.string().optional(),
  negative_prompt: z.string().optional(),
  seed: z.number().int().optional(),
  parameters: z.record(z.unknown()).optional(),
  generated_at: z.string().optional(),
  checksum: z.string().optional(),
});

export type AnimationModeContract = z.infer<typeof animationModeSchema>;
export type RenderProfileContract = z.infer<typeof renderProfileSchema>;
export type VariantFormatContract = z.infer<typeof variantFormatSchema>;
export type PlatformContract = z.infer<typeof platformSchema>;
export type GeneratorMeta = z.infer<typeof generatorMetaSchema>;
