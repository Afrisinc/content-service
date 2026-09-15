import { z } from 'zod';
import {
  generatorMetaSchema,
  slugSchema,
  timeOfDaySchema,
  versionedIdSchema,
  weatherSchema,
} from './common.contract';

export const environmentBibleSchema = z.object({
  environment_id: versionedIdSchema,
  slug: slugSchema,
  name: z.string().min(1).max(80),
  description: z.string().min(10).max(600),
  scale: z.enum(['interior', 'exterior', 'mixed']),
  time_of_day: timeOfDaySchema,
  weather: weatherSchema.default('clear'),
  mood: z.string().max(80).optional(),
  key_light: z.string().max(120).optional(),
  palette: z
    .array(z.string().regex(/^#[0-9a-fA-F]{6}$/))
    .max(6)
    .default([]),
  style: z.string().min(2).max(120),
  layers: z.array(z.enum(['sky', 'far', 'mid', 'near', 'foreground'])).default([]),
  reference_asset_keys: z.array(z.string()).default([]),
  generator: generatorMetaSchema.optional(),
});

export const propSchema = z.object({
  prop_id: versionedIdSchema,
  slug: slugSchema,
  name: z.string().min(1).max(80),
  description: z.string().max(400),
  scale_metres: z.number().positive().max(100).optional(),
  interactable: z.boolean().default(false),
  reference_asset_keys: z.array(z.string()).default([]),
  generator: generatorMetaSchema.optional(),
});

export const environmentBibleListSchema = z.object({
  environments: z.array(environmentBibleSchema).min(1).max(10),
  props: z.array(propSchema).max(24).default([]),
});

export type EnvironmentBible = z.infer<typeof environmentBibleSchema>;
export type PropSpec = z.infer<typeof propSchema>;
export type EnvironmentBibleList = z.infer<typeof environmentBibleListSchema>;
