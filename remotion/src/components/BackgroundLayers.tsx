import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { cameraTransform, parallaxOffset, type CameraTransform } from '../camera';
import type { SceneProps } from '../schema';

interface Props {
  layers: SceneProps['background_layers'];
  transform: CameraTransform;
}

function resolve(assetKey: string): string {
  return assetKey.startsWith('http') ? assetKey : staticFile(assetKey);
}

export const BackgroundLayers: React.FC<Props> = ({ layers, transform }) => (
  <AbsoluteFill>
    {[...layers]
      .sort((a, b) => b.depth - a.depth)
      .map(layer => {
        const offset = parallaxOffset(layer.depth, transform);
        return (
          <AbsoluteFill
            key={layer.asset_key}
            style={{
              transform: `scale(${offset.scale}) translate(${offset.translateX}px, ${offset.translateY}px) rotate(${offset.rotate}deg)`,
              transformOrigin: 'center center',
            }}
          >
            <Img
              src={resolve(layer.asset_key)}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          </AbsoluteFill>
        );
      })}
  </AbsoluteFill>
);

export { cameraTransform };
