import React from 'react';
import { Composition } from 'remotion';
import { SceneComposition } from './compositions/Scene';
import { sceneProps, type SceneProps } from './schema';

const FALLBACK: SceneProps = {
  scene_id: 'scene_000',
  duration_seconds: 6,
  fps: 30,
  width: 1920,
  height: 1080,
  background_layers: [],
  character_sources: {},
  shots: [
    {
      shot_id: 'shot_000',
      index: 0,
      duration_seconds: 6,
      camera: { shot_size: 'medium', lens_mm: 50, depth_of_field: false, movement: { type: 'static', amount: 0, easing: 'ease_in_out' } },
      characters: [],
      transition_out: 'cut',
    },
  ],
  subtitles: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="Scene"
    component={SceneComposition}
    schema={sceneProps}
    defaultProps={FALLBACK}
    durationInFrames={Math.round(FALLBACK.duration_seconds * FALLBACK.fps)}
    fps={FALLBACK.fps}
    width={FALLBACK.width}
    height={FALLBACK.height}
    calculateMetadata={({ props }) => ({
      durationInFrames: Math.max(1, Math.round(props.duration_seconds * props.fps)),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
);
