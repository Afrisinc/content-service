import { z } from 'zod';
import { platformSchema, variantFormatSchema } from './common.contract';

export const platformMetadataSchema = z.object({
  platform: platformSchema,
  title: z.string().min(1).max(100),
  description: z.string().max(5000),
  tags: z.array(z.string().max(40)).max(30).default([]),
  hashtags: z.array(z.string().max(40)).max(30).default([]),
  category: z.string().max(60).optional(),
  privacy: z.enum(['public', 'unlisted', 'private']).default('public'),
  made_for_kids: z.boolean().default(false),
});

export const platformCopySchema = z.object({
  variants: z.array(platformMetadataSchema).min(1),
});

export const uploadInputSchema = z.object({
  production_id: z.string(),
  variant_id: z.string(),
  platform: platformSchema,
  format: variantFormatSchema,
  video_key: z.string(),
  video_url: z.string().url().optional(),
  thumbnail_key: z.string().optional(),
  subtitle_key: z.string().optional(),
  metadata: platformMetadataSchema,
  idempotency_key: z.string().min(8),
  scheduled_for: z.string().optional(),
});

export const uploadResultSchema = z.object({
  external_id: z.string(),
  external_url: z.string().optional(),
  status: z.enum(['uploaded', 'processing', 'published', 'scheduled', 'failed']),
  raw: z.record(z.unknown()).optional(),
});

export type PlatformMetadata = z.infer<typeof platformMetadataSchema>;
export type UploadInput = z.infer<typeof uploadInputSchema>;
export type UploadResult = z.infer<typeof uploadResultSchema>;
