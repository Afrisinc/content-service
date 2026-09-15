import { z } from 'zod';

export const qualityCheckSchema = z.object({
  name: z.string(),
  passed: z.boolean(),
  severity: z.enum(['info', 'warning', 'error']).default('error'),
  expected: z.string().optional(),
  actual: z.string().optional(),
  detail: z.string().optional(),
});

export const qualityReportSchema = z.object({
  target: z.enum(['scene', 'master', 'variant', 'audio', 'subtitle']),
  target_id: z.string().optional(),
  verdict: z.enum(['passed', 'warning', 'failed']),
  checks: z.array(qualityCheckSchema),
  failures: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  probe: z.record(z.unknown()).optional(),
});

export const qualityThresholdsSchema = z.object({
  min_duration_seconds: z.number().default(1),
  max_duration_drift_seconds: z.number().default(1.5),
  expected_width: z.number().int(),
  expected_height: z.number().int(),
  expected_fps: z.number(),
  max_black_frame_ratio: z.number().min(0).max(1).default(0.02),
  max_silence_ratio: z.number().min(0).max(1).default(0.35),
  max_leading_silence_seconds: z.number().default(1.5),
  target_lufs: z.number().default(-14),
  lufs_tolerance: z.number().default(2),
  max_true_peak_db: z.number().default(-1),
  require_audio: z.boolean().default(true),
});

export const moderationVerdictSchema = z.object({
  allowed: z.boolean(),
  categories: z.array(z.string()).default([]),
  reasons: z.array(z.string()).default([]),
  severity: z.enum(['none', 'low', 'medium', 'high']).default('none'),
});

export type QualityReport = z.infer<typeof qualityReportSchema>;
export type QualityThresholds = z.infer<typeof qualityThresholdsSchema>;
export type ModerationVerdict = z.infer<typeof moderationVerdictSchema>;
