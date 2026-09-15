import { z } from 'zod';
import { shotSizeSchema, cameraMovementSchema, versionedIdSchema } from './common.contract';

export const videoAspectSchema = z.enum(['16:9', '9:16', '1:1', '4:3', '3:4']);

export const videoPromptSchema = z.object({
  shot_id: z.string(),
  prompt: z.string().min(20).max(1500),
  negative_prompt: z.string().max(600).default(''),
  camera_note: z.string().max(200).optional(),
  subject_note: z.string().max(300).optional(),
});

export const shotPromptListSchema = z.object({
  shots: z.array(videoPromptSchema).min(1).max(24),
});

export const videoGenerationSpecSchema = z.object({
  shot_id: z.string(),
  prompt: z.string().min(1),
  negative_prompt: z.string().default(''),
  width: z.number().int().min(256).max(1920),
  height: z.number().int().min(256).max(1920),
  frames: z.number().int().min(9).max(241),
  fps: z.number().min(8).max(30).default(16),
  steps: z.number().int().min(2).max(60).default(20),
  cfg_scale: z.number().min(1).max(12).default(5),
  seed: z.number().int().optional(),
  workflow: z.string().optional(),
  reference_image_key: z.string().optional(),
  continuity_frame_key: z.string().optional(),
  shot_size: shotSizeSchema.optional(),
  movement: cameraMovementSchema.optional(),
  character_ids: z.array(versionedIdSchema).default([]),
});

export const videoPreviewRequestSchema = z.object({
  prompt: z.string().min(1).max(1500),
  negative_prompt: z.string().max(600).optional(),
  seconds: z.number().min(0.5).max(15).optional(),
  width: z.number().int().min(256).max(1920).optional(),
  height: z.number().int().min(256).max(1920).optional(),
  fps: z.number().min(8).max(30).optional(),
  steps: z.number().int().min(2).max(60).optional(),
  cfg_scale: z.number().min(1).max(12).optional(),
  seed: z.number().int().optional(),
  workflow: z.string().optional(),
});

export const videoGenerationResultSchema = z.object({
  shot_id: z.string(),
  storage_key: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  frames: z.number().int(),
  duration_seconds: z.number(),
  bytes: z.number().int(),
  checksum: z.string(),
  seed: z.number().int(),
  model: z.string(),
  duration_ms: z.number().int(),
});

export type VideoAspect = z.infer<typeof videoAspectSchema>;
export type VideoPrompt = z.infer<typeof videoPromptSchema>;
export type ShotPromptList = z.infer<typeof shotPromptListSchema>;
export type VideoGenerationSpec = z.infer<typeof videoGenerationSpecSchema>;
export type VideoGenerationResult = z.infer<typeof videoGenerationResultSchema>;
export type VideoPreviewRequest = z.infer<typeof videoPreviewRequestSchema>;
