import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import type { SceneProps } from '../schema';

interface Props {
  cues: SceneProps['subtitles'];
  fps: number;
  height: number;
}

export const SubtitleLayer: React.FC<Props> = ({ cues, fps, height }) => {
  const frame = useCurrentFrame();
  const seconds = frame / fps;
  const active = cues.find(cue => seconds >= cue.start && seconds <= cue.end);

  if (!active) {
    return null;
  }

  return (
    <AbsoluteFill style={{ justifyContent: 'flex-end', alignItems: 'center', paddingBottom: height * 0.1 }}>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: height * 0.008,
          maxWidth: '82%',
        }}
      >
        {active.lines.map(line => (
          <span
            key={line}
            style={{
              fontFamily: 'Inter, Arial, sans-serif',
              fontSize: height * 0.045,
              fontWeight: 700,
              color: '#ffffff',
              textAlign: 'center',
              lineHeight: 1.25,
              padding: `${height * 0.006}px ${height * 0.014}px`,
              borderRadius: height * 0.008,
              backgroundColor: 'rgba(0,0,0,0.62)',
              textShadow: '0 2px 8px rgba(0,0,0,0.6)',
            }}
          >
            {line}
          </span>
        ))}
      </div>
    </AbsoluteFill>
  );
};
