import { AnimationMode, RenderProfile, SocialPlatform, VariantFormat } from '@prisma/client';
import { env } from '@/config/env';
import type { RenderSettings, VariantSpec } from '../contracts';

export interface FormatDimensions {
  width: number;
  height: number;
  fps: number;
  crf: number;
  maxDurationSeconds?: number;
  burnSubtitles: boolean;
  safeAreaPadding: number;
}

export const FORMAT_DIMENSIONS: Record<VariantFormat, FormatDimensions> = {
  LANDSCAPE_16_9: {
    width: 1920,
    height: 1080,
    fps: 30,
    crf: 19,
    burnSubtitles: false,
    safeAreaPadding: 0,
  },
  VERTICAL_9_16: {
    width: 1080,
    height: 1920,
    fps: 30,
    crf: 20,
    maxDurationSeconds: 180,
    burnSubtitles: true,
    safeAreaPadding: 0.06,
  },
  PORTRAIT_4_5: {
    width: 1080,
    height: 1350,
    fps: 30,
    crf: 20,
    burnSubtitles: true,
    safeAreaPadding: 0.04,
  },
  SQUARE_1_1: {
    width: 1080,
    height: 1080,
    fps: 30,
    crf: 20,
    burnSubtitles: true,
    safeAreaPadding: 0.04,
  },
};

export const FORMAT_LABEL: Record<VariantFormat, VariantSpec['format']> = {
  LANDSCAPE_16_9: '16:9',
  VERTICAL_9_16: '9:16',
  PORTRAIT_4_5: '4:5',
  SQUARE_1_1: '1:1',
};

export const PLATFORM_FORMATS: Partial<Record<SocialPlatform, VariantFormat[]>> = {
  youtube: ['LANDSCAPE_16_9', 'VERTICAL_9_16'],
  instagram: ['VERTICAL_9_16', 'PORTRAIT_4_5'],
  facebook: ['LANDSCAPE_16_9', 'VERTICAL_9_16'],
  tiktok: ['VERTICAL_9_16'],
  linkedin: ['LANDSCAPE_16_9', 'SQUARE_1_1'],
  twitter: ['LANDSCAPE_16_9', 'SQUARE_1_1'],
};

export const PROFILE_SAMPLES: Record<RenderProfile, number> = {
  PREVIEW: 8,
  DRAFT: 24,
  PRODUCTION: 64,
  PREMIUM: 256,
};

export const PROFILE_SCALE: Record<RenderProfile, number> = {
  PREVIEW: 0.25,
  DRAFT: 0.5,
  PRODUCTION: 1,
  PREMIUM: 1,
};

export const WAN_FRAME_STRIDE = 4;

export function engineFor(mode: AnimationMode, profile: RenderProfile): RenderSettings['engine'] {
  if (mode === 'AI_VIDEO') {
    return 'WAN';
  }
  if (mode === 'TWO_D') {
    return 'REMOTION';
  }
  return profile === 'PREMIUM' ? 'CYCLES' : 'EEVEE';
}

export function queueForMode(
  mode: AnimationMode
): 'animation.render.2d' | 'animation.render.3d' | 'animation.render.ai' {
  if (mode === 'AI_VIDEO') {
    return 'animation.render.ai';
  }
  return mode === 'TWO_D' ? 'animation.render.2d' : 'animation.render.3d';
}

export function framesForDuration(seconds: number, fps: number, maxFrames: number): number {
  const raw = Math.round(seconds * fps);
  const snapped = Math.round((raw - 1) / WAN_FRAME_STRIDE) * WAN_FRAME_STRIDE + 1;
  return Math.min(Math.max(snapped, WAN_FRAME_STRIDE + 1), maxFrames);
}

export function clipSecondsFor(maxFrames: number, fps: number): number {
  return Number((maxFrames / fps).toFixed(2));
}

export function masterSettings(mode: AnimationMode, profile: RenderProfile): RenderSettings {
  const base = FORMAT_DIMENSIONS.LANDSCAPE_16_9;
  return {
    width: base.width,
    height: base.height,
    fps: env.STUDIO_MASTER_FPS,
    samples: PROFILE_SAMPLES[profile],
    engine: engineFor(mode, profile),
    video_codec: 'h264',
    audio_codec: 'aac',
    crf: profile === 'PREMIUM' ? 16 : 18,
    transparent: false,
  };
}

export function variantSpecs(formats: VariantFormat[]): VariantSpec[] {
  return formats.map(format => {
    const dimensions = FORMAT_DIMENSIONS[format];
    return {
      format: FORMAT_LABEL[format],
      width: dimensions.width,
      height: dimensions.height,
      fps: dimensions.fps,
      crf: dimensions.crf,
      max_duration_seconds: dimensions.maxDurationSeconds,
      burn_subtitles: dimensions.burnSubtitles,
      safe_area_padding: dimensions.safeAreaPadding,
    };
  });
}

export function formatsForPlatforms(
  platforms: SocialPlatform[],
  requested: VariantFormat[]
): VariantFormat[] {
  if (requested.length > 0) {
    return [...new Set(requested)];
  }
  const derived = platforms.flatMap(platform => PLATFORM_FORMATS[platform] ?? []);
  return derived.length > 0 ? [...new Set(derived)] : ['LANDSCAPE_16_9', 'VERTICAL_9_16'];
}

export function qualityThresholdsFor(format: VariantFormat, expectedDuration: number) {
  const dimensions = FORMAT_DIMENSIONS[format];
  return {
    min_duration_seconds: 1,
    max_duration_drift_seconds: Math.max(1.5, expectedDuration * 0.05),
    expected_width: dimensions.width,
    expected_height: dimensions.height,
    expected_fps: dimensions.fps,
    max_black_frame_ratio: env.STUDIO_QA_MAX_BLACK_RATIO,
    max_silence_ratio: env.STUDIO_QA_MAX_SILENCE_RATIO,
    max_leading_silence_seconds: 1.5,
    target_lufs: env.STUDIO_TARGET_LUFS,
    lufs_tolerance: 2,
    max_true_peak_db: -1,
    require_audio: true,
  };
}
