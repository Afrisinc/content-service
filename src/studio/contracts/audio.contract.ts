import { z } from 'zod';
import { versionedIdSchema } from './common.contract';

export const voiceSpecSchema = z.object({
  voice_id: z.string().min(1).max(60),
  engine: z.enum(['kokoro', 'piper', 'openai', 'elevenlabs']).default('kokoro'),
  language: z.string().min(2).max(12).default('en'),
  speed: z.number().min(0.5).max(2).default(1),
  pitch: z.number().min(-12).max(12).default(0),
  emotion: z.string().max(40).default('neutral'),
});

export const voiceCastingSchema = z.object({
  narrator: voiceSpecSchema,
  characters: z
    .array(
      z.object({
        character_id: versionedIdSchema,
        voice: voiceSpecSchema,
        pronunciation_hints: z
          .array(z.object({ term: z.string(), say_as: z.string() }))
          .max(20)
          .default([]),
      })
    )
    .max(12)
    .default([]),
});

export const ttsRequestSchema = z.object({
  track_id: z.string().min(3).max(80),
  text: z.string().min(1).max(2000),
  voice: voiceSpecSchema,
  pauses_ms: z
    .array(z.object({ after_char: z.number().int().min(0), ms: z.number().int().min(0).max(5000) }))
    .max(40)
    .default([]),
});

export const wordTimingSchema = z.object({
  word: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
});

export const segmentTimingSchema = z.object({
  text: z.string(),
  start: z.number().min(0),
  end: z.number().min(0),
  words: z.array(wordTimingSchema).default([]),
});

export const transcriptSchema = z.object({
  language: z.string().default('en'),
  duration_seconds: z.number().min(0),
  segments: z.array(segmentTimingSchema).default([]),
});

export const visemeSchema = z.object({
  shape: z.enum(['REST', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'X']),
  start: z.number().min(0),
  end: z.number().min(0),
});

export const audioMixSpecSchema = z.object({
  production_id: z.string(),
  target_lufs: z.number().min(-30).max(-6).default(-14),
  true_peak_db: z.number().min(-6).max(0).default(-1),
  tracks: z
    .array(
      z.object({
        kind: z.enum(['vo', 'dialogue', 'sfx', 'ambience', 'music']),
        storage_key: z.string(),
        gain_db: z.number().min(-40).max(12).default(0),
        start_at: z.number().min(0).default(0),
        fade_in_ms: z.number().min(0).max(10000).default(0),
        fade_out_ms: z.number().min(0).max(10000).default(0),
        duck_under: z.enum(['vo', 'dialogue']).optional(),
      })
    )
    .min(1),
});

export type VoiceSpec = z.infer<typeof voiceSpecSchema>;
export type VoiceCasting = z.infer<typeof voiceCastingSchema>;
export type TtsRequest = z.infer<typeof ttsRequestSchema>;
export type Transcript = z.infer<typeof transcriptSchema>;
export type Viseme = z.infer<typeof visemeSchema>;
export type AudioMixSpec = z.infer<typeof audioMixSpecSchema>;
