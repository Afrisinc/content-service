import { env } from '@/config/env';
import { OllamaLlmProvider } from './llm/ollama.provider';
import { OpenAiCompatibleLlmProvider } from './llm/openai-compatible.provider';
import { ComfyUiImageProvider } from './image/comfyui.provider';
import { KokoroTtsProvider } from './tts/kokoro.provider';
import { WhisperSttProvider } from './stt/whisper.provider';
import { ComfyUiWanVideoProvider } from './video/comfyui-wan.provider';
import type {
  ImageProvider,
  LlmProvider,
  SttProvider,
  TtsProvider,
  VideoProvider,
} from './provider.types';

let llm: LlmProvider | undefined;
let image: ImageProvider | undefined;
let tts: TtsProvider | undefined;
let stt: SttProvider | undefined;
let video: VideoProvider | undefined;

export function getLlmProvider(): LlmProvider {
  if (!llm) {
    llm =
      env.STUDIO_LLM_PROVIDER === 'ollama'
        ? new OllamaLlmProvider()
        : new OpenAiCompatibleLlmProvider();
  }
  return llm;
}

export function getImageProvider(): ImageProvider {
  if (!image) {
    image = new ComfyUiImageProvider();
  }
  return image;
}

export function getTtsProvider(): TtsProvider {
  if (!tts) {
    tts = new KokoroTtsProvider();
  }
  return tts;
}

export function getSttProvider(): SttProvider {
  if (!stt) {
    stt = new WhisperSttProvider();
  }
  return stt;
}

export function getVideoProvider(): VideoProvider {
  if (!video) {
    video = new ComfyUiWanVideoProvider();
  }
  return video;
}

export function setProviders(overrides: {
  llm?: LlmProvider;
  image?: ImageProvider;
  tts?: TtsProvider;
  stt?: SttProvider;
  video?: VideoProvider;
}): void {
  llm = overrides.llm ?? llm;
  image = overrides.image ?? image;
  tts = overrides.tts ?? tts;
  stt = overrides.stt ?? stt;
  video = overrides.video ?? video;
}

export async function providerHealth(): Promise<Record<string, boolean>> {
  const [llmUp, imageUp, ttsUp, sttUp, videoUp] = await Promise.all([
    getLlmProvider().healthy(),
    getImageProvider().healthy(),
    getTtsProvider().healthy(),
    getSttProvider().healthy(),
    getVideoProvider().healthy(),
  ]);
  return { llm: llmUp, image: imageUp, tts: ttsUp, stt: sttUp, video: videoUp };
}

export * from './provider.types';
export {
  OllamaLlmProvider,
  OpenAiCompatibleLlmProvider,
  ComfyUiImageProvider,
  KokoroTtsProvider,
  WhisperSttProvider,
  ComfyUiWanVideoProvider,
};
