import {
  voiceCastingSchema,
  type CharacterBible,
  type Story,
  type VoiceCasting,
} from '../contracts';
import { loadPrompt } from '../prompts/prompt.loader';
import { generateStructured, type StructuredResult } from './structured';

export async function directVoices(
  story: Story,
  characters: CharacterBible[],
  availableVoices: string[]
): Promise<StructuredResult<VoiceCasting>> {
  const prompt = loadPrompt('audio/voice_director');

  return generateStructured({
    stage: 'voices',
    schema: voiceCastingSchema,
    prompt: prompt.render({
      story: {
        title: story.title,
        logline: story.logline,
        language: story.language,
        audience: story.audience,
      },
      characters: characters.map(character => ({
        character_id: character.character_id,
        name: character.name,
        age: character.age,
        role: character.role,
        personality: character.personality,
        voice_profile: character.voice_profile,
      })),
      available_voices: availableVoices.join(', '),
      language: story.language,
    }),
    temperature: 0.4,
  });
}

export function voicePromptVersion(): string {
  const prompt = loadPrompt('audio/voice_director');
  return `${prompt.name}.${prompt.version}.${prompt.checksum}`;
}
