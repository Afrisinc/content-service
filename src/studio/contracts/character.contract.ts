import { z } from 'zod';
import {
  emotionSchema,
  generatorMetaSchema,
  slugSchema,
  versionedIdSchema,
} from './common.contract';

export const characterAppearanceSchema = z.object({
  hair: z.string().min(2).max(80),
  eyes: z.string().min(2).max(80),
  skin: z.string().min(2).max(80),
  build: z.string().max(80).optional(),
  height_cm: z.number().int().min(30).max(260).optional(),
  clothing: z.string().min(2).max(200),
  distinguishing_features: z.array(z.string().max(120)).max(6).default([]),
});

export const characterBibleSchema = z.object({
  character_id: versionedIdSchema,
  slug: slugSchema,
  name: z.string().min(1).max(60),
  age: z.number().int().min(0).max(120).optional(),
  role: z.enum(['protagonist', 'antagonist', 'supporting', 'narrator', 'background']),
  gender_presentation: z.string().max(40).optional(),
  appearance: characterAppearanceSchema,
  personality: z.array(z.string().max(60)).min(1).max(8),
  voice_profile: z.string().max(120).optional(),
  style: z.string().min(2).max(120),
  supported_actions: z.array(z.string()).default([]),
  supported_expressions: z.array(emotionSchema).default(['neutral']),
  reference_asset_keys: z.array(z.string()).default([]),
  generator: generatorMetaSchema.optional(),
});

export const characterBibleListSchema = z.object({
  characters: z.array(characterBibleSchema).min(1).max(12),
});

export type CharacterAppearance = z.infer<typeof characterAppearanceSchema>;
export type CharacterBible = z.infer<typeof characterBibleSchema>;
export type CharacterBibleList = z.infer<typeof characterBibleListSchema>;
