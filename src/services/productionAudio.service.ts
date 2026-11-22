import { Prisma } from '@prisma/client';
import { env } from '@/config/env';
import { NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { productionAssetRepository } from '@/repositories/productionAsset.repository';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import { productionRepository } from '@/repositories/production.repository';
import { areaKey, audioKey, checksumOf, getObjectStorage } from '@/storage';
import type { CharacterBible, Story, VoiceCasting, VoiceSpec } from '@/studio/contracts';
import { directVoices, voicePromptVersion } from '@/studio/directors';
import { getMediaEngineClient } from '@/studio/engines/media.client';
import { getSttProvider, getTtsProvider } from '@/studio/providers';
import { ttsCacheKey } from '@/studio/pipeline/cache';

interface RenderedLine {
  trackId: string;
  sceneId: string;
  kind: 'VO' | 'DIALOGUE';
  storageKey: string;
  visemeKey: string;
  durationSeconds: number;
  text: string;
  segments: unknown[];
  speaker?: string;
}

export class ProductionAudioService {
  async castVoices(productionId: string): Promise<VoiceCasting> {
    const stored = await productionRepository.getStory(productionId);
    if (!stored) {
      throw new NotFoundError('this production has no story yet');
    }

    const story = stored.spec as unknown as Story;
    const characters = (await productionAssetRepository.charactersFor(productionId))
      .map(character => character.versions[0]?.spec as unknown as CharacterBible)
      .filter(Boolean);

    const available = await getTtsProvider()
      .voices()
      .catch(() => [env.STUDIO_DEFAULT_VOICE]);

    const casting = await directVoices(
      story,
      characters,
      available.length ? available : [env.STUDIO_DEFAULT_VOICE]
    );

    await productionRepository.mergeReproducibility(productionId, {
      voice_prompt: voicePromptVersion(),
      voices: casting.data,
    });

    return casting.data;
  }

  async renderNarration(productionId: string): Promise<RenderedLine[]> {
    const stored = await productionRepository.getStory(productionId);
    if (!stored) {
      throw new NotFoundError('this production has no story yet');
    }

    const story = stored.spec as unknown as Story;
    const casting = await this.castVoices(productionId);
    const voiceByCharacter = new Map(
      casting.characters.map(entry => [entry.character_id, entry.voice] as const)
    );

    const rendered: RenderedLine[] = [];

    for (const scene of story.scenes) {
      for (const line of scene.narration) {
        rendered.push(
          await this.renderLine(
            productionId,
            scene.scene_id,
            line.line_id,
            line.text,
            casting.narrator,
            'VO'
          )
        );
      }
      for (const line of scene.dialogue) {
        const voice = voiceByCharacter.get(line.character_id) ?? casting.narrator;
        rendered.push(
          await this.renderLine(
            productionId,
            scene.scene_id,
            line.line_id,
            line.text,
            voice,
            'DIALOGUE',
            line.character_id
          )
        );
      }
    }

    logger.info({ productionId, tracks: rendered.length }, 'studio.audio.rendered');
    return rendered;
  }

  private async renderLine(
    productionId: string,
    sceneId: string,
    lineId: string,
    text: string,
    voice: VoiceSpec,
    kind: 'VO' | 'DIALOGUE',
    speaker?: string
  ): Promise<RenderedLine> {
    const storage = getObjectStorage();
    const trackId = `${sceneId}_${lineId}`;
    const key = audioKey(productionId, kind.toLowerCase(), trackId);
    const cacheKey = ttsCacheKey({
      text,
      voiceId: voice.voice_id,
      engine: voice.engine,
      speed: voice.speed,
      pitch: voice.pitch,
      language: voice.language,
    });

    const existing = await storage.head(key);
    if (existing && existing.checksum === cacheKey) {
      const scene = await productionJobRepository.sceneBySceneId(productionId, sceneId);
      return {
        trackId,
        sceneId: scene?.id ?? sceneId,
        kind,
        storageKey: key,
        visemeKey: `${key}.visemes.json`,
        durationSeconds: 0,
        text,
        segments: [],
        speaker,
      };
    }

    const audio = await getTtsProvider().synthesize({
      text,
      voiceId: voice.voice_id,
      language: voice.language,
      speed: voice.speed,
      pitch: voice.pitch,
      emotion: voice.emotion,
    });

    await storage.put({
      key,
      body: audio.audio,
      contentType: 'audio/wav',
      metadata: { checksum: cacheKey, track: trackId },
    });

    const transcript = await getSttProvider().transcribe({
      audio: audio.audio,
      language: voice.language,
      wordTimestamps: true,
    });

    const visemeKey = `${key}.visemes.json`;
    const visemes = buildVisemes(transcript.segments);
    await storage.put({
      key: visemeKey,
      body: Buffer.from(JSON.stringify({ visemes })),
      contentType: 'application/json',
    });

    const scene = await productionJobRepository.sceneBySceneId(productionId, sceneId);

    await productionAssetRepository.createAudioTrack({
      productionId,
      sceneId: scene?.id ?? null,
      kind,
      storageKey: key,
      durationSeconds: audio.durationSeconds,
      bytes: audio.audio.byteLength,
      checksum: checksumOf(audio.audio),
      speaker,
      voice: voice as unknown as Prisma.InputJsonValue,
      transcript: transcript as unknown as Prisma.InputJsonValue,
      visemes: { visemes } as unknown as Prisma.InputJsonValue,
      generator: { provider: audio.usage.provider, model: audio.usage.model, cache_key: cacheKey },
      status: 'SUCCEEDED',
    });

    return {
      trackId,
      sceneId: scene?.id ?? sceneId,
      kind,
      storageKey: key,
      visemeKey,
      durationSeconds: audio.durationSeconds,
      text,
      segments: transcript.segments,
      speaker,
    };
  }

  async buildSubtitles(
    productionId: string,
    segments: unknown[],
    language: string
  ): Promise<Record<string, string>> {
    const media = getMediaEngineClient();
    const response = await media.subtitles({
      segments,
      formats: ['srt', 'vtt', 'ass'],
      output_prefix: areaKey(productionId, 'subtitles'),
      language,
    });

    for (const [format, key] of Object.entries(response.keys)) {
      await productionJobRepository.createSubtitle({
        productionId,
        format: format.toUpperCase() as 'SRT' | 'VTT' | 'ASS',
        language,
        storageKey: key,
        burnedIn: false,
      });
    }

    return response.keys;
  }

  async mixMaster(productionId: string, tracks: RenderedLine[]): Promise<string> {
    const outputKey = audioKey(productionId, 'master', 'master');
    let cursor = 0;

    const mixTracks = tracks.map(track => {
      const entry = {
        kind: track.kind === 'VO' ? ('vo' as const) : ('dialogue' as const),
        storage_key: track.storageKey,
        gain_db: 0,
        start_at: Number(cursor.toFixed(3)),
        fade_in_ms: 0,
        fade_out_ms: 0,
      };
      cursor += track.durationSeconds + env.STUDIO_LINE_GAP_SECONDS;
      return entry;
    });

    if (mixTracks.length === 0) {
      throw new NotFoundError('this production has no rendered audio to mix');
    }

    const response = await getMediaEngineClient().mix({
      production_id: productionId,
      target_lufs: env.STUDIO_TARGET_LUFS,
      true_peak_db: -1,
      tracks: mixTracks,
      output_key: outputKey,
    });

    await productionAssetRepository.createAudioTrack({
      productionId,
      kind: 'MASTER',
      storageKey: response.output_key,
      durationSeconds: response.duration_seconds,
      loudnessLufs: response.integrated_lufs,
      peakDb: response.true_peak_db,
      bytes: response.bytes,
      checksum: response.checksum,
      status: 'SUCCEEDED',
    });

    logger.info(
      { productionId, outputKey, tracks: mixTracks.length, lufs: response.integrated_lufs },
      'studio.audio.mixed'
    );
    return response.output_key;
  }
}

function buildVisemes(
  segments: Array<{ words: Array<{ word: string; start: number; end: number }> }>
) {
  const letterToShape: Record<string, string> = {
    A: 'D',
    E: 'C',
    I: 'C',
    O: 'E',
    U: 'F',
    B: 'B',
    M: 'B',
    P: 'B',
    F: 'G',
    V: 'G',
    L: 'H',
    T: 'H',
    D: 'H',
    N: 'H',
    W: 'F',
    R: 'F',
  };

  const visemes: Array<{ shape: string; start: number; end: number }> = [];

  for (const segment of segments) {
    for (const word of segment.words) {
      const letters = [...word.word.toUpperCase()].filter(character => /[A-Z]/.test(character));
      if (letters.length === 0) {
        continue;
      }
      const span = Math.max(0.02, (word.end - word.start) / letters.length);
      letters.forEach((letter, index) => {
        const start = word.start + index * span;
        visemes.push({
          shape: letterToShape[letter] ?? 'A',
          start: Number(start.toFixed(4)),
          end: Number((start + span).toFixed(4)),
        });
      });
      visemes.push({
        shape: 'REST',
        start: Number(word.end.toFixed(4)),
        end: Number((word.end + 0.05).toFixed(4)),
      });
    }
  }

  return visemes;
}

export const productionAudioService = new ProductionAudioService();
export type { RenderedLine };
