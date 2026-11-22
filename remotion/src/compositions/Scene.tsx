import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BackgroundLayers } from '../components/BackgroundLayers';
import { CharacterLayer } from '../components/CharacterLayer';
import { SubtitleLayer } from '../components/SubtitleLayer';
import { cameraTransform } from '../camera';
import type { SceneProps, ShotProps } from '../schema';

interface ShotViewProps {
  shot: ShotProps;
  scene: SceneProps;
  durationInFrames: number;
}

const ShotView: React.FC<ShotViewProps> = ({ shot, scene, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const transform = cameraTransform(shot.camera, frame, durationInFrames);

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070c', overflow: 'hidden' }}>
      <BackgroundLayers layers={scene.background_layers} transform={transform} />
      <AbsoluteFill
        style={{
          transform: `scale(${transform.scale}) translate(${transform.translateX}px, ${transform.translateY}px) rotate(${transform.rotate}deg)`,
          transformOrigin: 'center bottom',
        }}
      >
        {shot.characters.map((character, index) => (
          <CharacterLayer
            key={character.character_id}
            character={character}
            source={scene.character_sources[character.character_id]}
            fps={fps}
            index={index}
            total={shot.characters.length}
          />
        ))}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const SceneComposition: React.FC<SceneProps> = props => {
  const { fps, height } = useVideoConfig();
  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#05070c' }}>
      {props.shots.map(shot => {
        const durationInFrames = Math.max(1, Math.round(shot.duration_seconds * fps));
        const from = cursor;
        cursor += durationInFrames;
        return (
          <Sequence key={shot.shot_id} from={from} durationInFrames={durationInFrames} name={shot.shot_id}>
            <ShotView shot={shot} scene={props} durationInFrames={durationInFrames} />
          </Sequence>
        );
      })}

      {props.audio_src ? (
        <Audio src={props.audio_src.startsWith('http') ? props.audio_src : staticFile(props.audio_src)} />
      ) : null}

      <SubtitleLayer cues={props.subtitles} fps={fps} height={height} />
    </AbsoluteFill>
  );
};
