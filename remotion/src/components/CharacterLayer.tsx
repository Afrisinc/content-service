import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import type { AnimationCommandProps, ShotProps } from '../schema';

interface Props {
  character: ShotProps['characters'][number];
  source: string | undefined;
  fps: number;
  index: number;
  total: number;
}

const LOCOMOTION: Record<string, number> = { walk: 90, run: 220 };

const AXIS: Record<string, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  forward: [0, 0.4],
  backward: [0, -0.4],
  up: [0, -1],
  down: [0, 1],
};

function activeCommands(commands: AnimationCommandProps[], seconds: number): AnimationCommandProps[] {
  return commands.filter(
    command => seconds >= command.start_time && seconds <= command.start_time + command.duration
  );
}

function displacement(commands: AnimationCommandProps[], seconds: number): [number, number] {
  let x = 0;
  let y = 0;

  for (const command of commands) {
    const speed = LOCOMOTION[command.action];
    if (!speed) {
      continue;
    }
    const elapsed = Math.max(0, Math.min(seconds - command.start_time, command.duration));
    const [dx, dy] = AXIS[command.direction ?? 'forward'] ?? [0, 0];
    x += dx * speed * command.speed * elapsed;
    y += dy * speed * command.speed * elapsed;
  }

  return [x, y];
}

function bob(commands: AnimationCommandProps[], frame: number): number {
  const moving = commands.some(command => command.action === 'walk' || command.action === 'run');
  if (!moving) {
    return Math.sin(frame / 24) * 2;
  }
  return Math.abs(Math.sin(frame / 4)) * -8;
}

export const CharacterLayer: React.FC<Props> = ({ character, source, fps, index, total }) => {
  const frame = useCurrentFrame();
  const seconds = frame / fps;

  if (!source) {
    return null;
  }

  const commands = activeCommands(character.animations, seconds);
  const [dx, dy] = displacement(character.animations, seconds);
  const talking = commands.some(command => command.action === 'talk');
  const spread = total > 1 ? (index / (total - 1) - 0.5) * 44 : 0;

  const mouthScale = talking ? 1 + Math.abs(Math.sin(frame / 2.2)) * 0.06 : 1;
  const opacity = interpolate(frame, [0, 4], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        transform: `translate(${spread}% , 0) translate(${dx}px, ${dy + bob(character.animations, frame)}px)`,
        opacity,
      }}
    >
      <Img
        src={source.startsWith('http') ? source : staticFile(source)}
        style={{
          height: '72%',
          objectFit: 'contain',
          transform: `scaleY(${mouthScale})`,
          transformOrigin: 'bottom center',
        }}
      />
    </AbsoluteFill>
  );
};
