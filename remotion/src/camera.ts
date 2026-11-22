import { interpolate, Easing } from 'remotion';
import type { CameraProps } from './schema';

const SHOT_SCALE: Record<string, number> = {
  extreme_wide: 1,
  wide: 1.08,
  medium_wide: 1.2,
  medium: 1.35,
  medium_close_up: 1.55,
  close_up: 1.9,
  extreme_close_up: 2.6,
  over_the_shoulder: 1.6,
  pov: 1.7,
};

const AXIS: Record<string, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
  forward: [0, 0],
  backward: [0, 0],
};

function easingFor(name: string) {
  if (name === 'linear') {
    return Easing.linear;
  }
  if (name === 'ease_in') {
    return Easing.in(Easing.cubic);
  }
  if (name === 'ease_out') {
    return Easing.out(Easing.cubic);
  }
  return Easing.inOut(Easing.cubic);
}

export interface CameraTransform {
  scale: number;
  translateX: number;
  translateY: number;
  rotate: number;
}

export function cameraTransform(
  camera: CameraProps,
  frame: number,
  durationInFrames: number
): CameraTransform {
  const base = SHOT_SCALE[camera.shot_size] ?? 1.3;
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: easingFor(camera.movement.easing),
  });

  const amount = camera.movement.amount;
  const transform: CameraTransform = { scale: base, translateX: 0, translateY: 0, rotate: 0 };

  switch (camera.movement.type) {
    case 'zoom':
    case 'dolly':
      transform.scale = base * (1 + (amount / 20) * progress);
      break;
    case 'truck':
    case 'pan': {
      const [dx, dy] = AXIS[camera.movement.direction ?? 'right'] ?? [1, 0];
      transform.translateX = dx * amount * 40 * progress;
      transform.translateY = dy * amount * 40 * progress;
      break;
    }
    case 'tilt': {
      transform.translateY = amount * 40 * progress;
      break;
    }
    case 'crane': {
      transform.translateY = -amount * 50 * progress;
      transform.scale = base * (1 + (amount / 60) * progress);
      break;
    }
    case 'orbit':
      transform.rotate = amount * 1.5 * progress;
      transform.translateX = Math.sin(progress * Math.PI) * amount * 30;
      break;
    case 'tracking': {
      const [dx] = AXIS[camera.movement.direction ?? 'right'] ?? [1, 0];
      transform.translateX = dx * amount * 25 * progress;
      transform.scale = base * 1.02;
      break;
    }
    case 'handheld': {
      transform.translateX = Math.sin(frame / 5) * 3;
      transform.translateY = Math.cos(frame / 7) * 2.5;
      transform.rotate = Math.sin(frame / 9) * 0.3;
      break;
    }
    default:
      break;
  }

  return transform;
}

export function parallaxOffset(depth: number, transform: CameraTransform): CameraTransform {
  const strength = 1 - depth;
  return {
    scale: 1 + (transform.scale - 1) * (0.4 + strength * 0.6),
    translateX: transform.translateX * (0.2 + strength),
    translateY: transform.translateY * (0.2 + strength),
    rotate: transform.rotate * (0.3 + strength * 0.7),
  };
}
