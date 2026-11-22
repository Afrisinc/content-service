export interface GenerationUsage {
  provider: string;
  model: string;
  modelVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  seed?: number;
  durationMs: number;
  costMicroUsd?: bigint;
}

export interface LlmRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  jsonOnly?: boolean;
  stop?: string[];
}

export interface LlmResponse {
  text: string;
  usage: GenerationUsage;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete(request: LlmRequest): Promise<LlmResponse>;
  healthy(): Promise<boolean>;
}

export interface ImageGenerationInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed?: number;
  steps?: number;
  cfgScale?: number;
  workflow?: string;
  referenceImageKeys?: string[];
  transparent?: boolean;
}

export interface ImageGenerationResult {
  images: Buffer[];
  mimeType: string;
  seed: number;
  usage: GenerationUsage;
}

export interface ImageProvider {
  readonly name: string;
  generate(input: ImageGenerationInput): Promise<ImageGenerationResult>;
  healthy(): Promise<boolean>;
}

export interface TtsInput {
  text: string;
  voiceId: string;
  language: string;
  speed: number;
  pitch: number;
  emotion?: string;
  format?: 'wav' | 'mp3';
}

export interface TtsResult {
  audio: Buffer;
  mimeType: string;
  durationSeconds: number;
  usage: GenerationUsage;
}

export interface TtsProvider {
  readonly name: string;
  synthesize(input: TtsInput): Promise<TtsResult>;
  voices(): Promise<string[]>;
  healthy(): Promise<boolean>;
}

export interface SttInput {
  audio: Buffer;
  language?: string;
  wordTimestamps?: boolean;
}

export interface SttResult {
  language: string;
  durationSeconds: number;
  segments: Array<{
    text: string;
    start: number;
    end: number;
    words: Array<{ word: string; start: number; end: number }>;
  }>;
  usage: GenerationUsage;
}

export interface SttProvider {
  readonly name: string;
  transcribe(input: SttInput): Promise<SttResult>;
  healthy(): Promise<boolean>;
}

export interface VideoGenerationInput {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  steps?: number;
  cfgScale?: number;
  seed?: number;
  workflow?: string;
  referenceImage?: Buffer;
  continuityFrame?: Buffer;
}

export interface VideoGenerationResult {
  video: Buffer;
  mimeType: string;
  width: number;
  height: number;
  fps: number;
  frames: number;
  durationSeconds: number;
  seed: number;
  usage: GenerationUsage;
}

export interface VideoProvider {
  readonly name: string;
  readonly model: string;
  readonly maxFrames: number;
  generate(input: VideoGenerationInput): Promise<VideoGenerationResult>;
  healthy(): Promise<boolean>;
}
