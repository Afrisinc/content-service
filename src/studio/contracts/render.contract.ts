import { z } from 'zod';
import { renderProfileSchema, variantFormatSchema } from './common.contract';
import { sceneSpecSchema } from './scene.contract';

export const renderSettingsSchema = z.object({
  width: z.number().int().min(64).max(7680),
  height: z.number().int().min(64).max(7680),
  fps: z.number().min(1).max(120),
  samples: z.number().int().min(1).max(4096).default(64),
  engine: z.enum(['EEVEE', 'CYCLES', 'REMOTION', 'WAN']).default('EEVEE'),
  video_codec: z.string().default('h264'),
  audio_codec: z.string().default('aac'),
  crf: z.number().int().min(0).max(51).default(18),
  transparent: z.boolean().default(false),
});

export const renderJobSpecSchema = z.object({
  job_id: z.string().min(3),
  production_id: z.string().min(3),
  scene: sceneSpecSchema,
  profile: renderProfileSchema,
  settings: renderSettingsSchema,
  asset_manifest: z.record(z.string()),
  audio_manifest: z.record(z.string()).default({}),
  output_key: z.string().min(3),
  timeout_seconds: z.number().int().min(30).max(21600).default(3600),
});

export const renderResultSchema = z.object({
  job_id: z.string(),
  output_key: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  duration_seconds: z.number(),
  bytes: z.number().int(),
  checksum: z.string(),
  has_audio: z.boolean().default(false),
  frames_rendered: z.number().int().default(0),
  engine_version: z.string(),
  duration_ms: z.number().int().default(0),
});

export const variantSpecSchema = z.object({
  format: variantFormatSchema,
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  crf: z.number().int().default(20),
  max_duration_seconds: z.number().int().optional(),
  burn_subtitles: z.boolean().default(false),
  safe_area_padding: z.number().min(0).max(0.3).default(0),
});

export const composeSpecSchema = z.object({
  production_id: z.string(),
  scene_keys: z.array(z.string()).min(1),
  master_audio_key: z.string().optional(),
  subtitle_key: z.string().optional(),
  intro_key: z.string().optional(),
  outro_key: z.string().optional(),
  watermark_key: z.string().optional(),
  variants: z.array(variantSpecSchema).min(1),
  output_prefix: z.string(),
  target_lufs: z.number().default(-14),
});

export type RenderSettings = z.infer<typeof renderSettingsSchema>;
export type RenderJobSpec = z.infer<typeof renderJobSpecSchema>;
export type RenderResult = z.infer<typeof renderResultSchema>;
export type VariantSpec = z.infer<typeof variantSpecSchema>;
export type ComposeSpec = z.infer<typeof composeSpecSchema>;
