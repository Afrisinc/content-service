import { audioMixSpecSchema, type AudioMixSpec } from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

export interface AudioTimelineEntry {
  kind: string;
  storage_key: string;
  scene_id?: string;
  start_at: number;
  duration_seconds: number;
  text?: string;
}

export async function directAudioMix(
  productionId: string,
  timeline: AudioTimelineEntry[],
  library: string[]
): Promise<StructuredResult<AudioMixSpec>> {
  const prompt = loadPrompt('audio/audio_director');

  return generateStructured({
    stage: 'audio-mix',
    schema: audioMixSpecSchema,
    prompt: prompt.render({
      timeline: { production_id: productionId, entries: timeline },
      library: library.join(', '),
    }),
    temperature: 0.3,
  });
}

export function audioPromptVersion(): string {
  const prompt = loadPrompt('audio/audio_director');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
