import { z } from 'zod';
import { moderationVerdictSchema, type ModerationVerdict } from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured } from './structured';

const thumbnailScoreSchema = z.object({
  scores: z.array(
    z.object({
      candidate_index: z.number().int().min(0),
      score: z.number().min(0).max(100),
      reasons: z.array(z.string()).default([]),
    })
  ),
  selected_index: z.number().int().min(0),
});

export type ThumbnailScores = z.infer<typeof thumbnailScoreSchema>;

export async function moderate(
  material: unknown,
  restrictions: string[],
  audience: string
): Promise<ModerationVerdict> {
  const prompt = loadPrompt('quality/moderation');
  const result = await generateStructured({
    stage: 'moderation',
    schema: moderationVerdictSchema,
    prompt: prompt.render({
      material,
      restrictions: restrictions.length ? restrictions.join(', ') : 'none beyond platform policy',
      audience,
    }),
    temperature: 0,
  });
  return result.data;
}

export async function scoreThumbnails(
  candidates: Array<{ index: number; prompt: string; description?: string }>
): Promise<ThumbnailScores> {
  const prompt = loadPrompt('quality/thumbnail_scorer');
  const result = await generateStructured({
    stage: 'thumbnail-scoring',
    schema: thumbnailScoreSchema,
    prompt: prompt.render({ candidates }),
    temperature: 0.2,
  });
  return result.data;
}
