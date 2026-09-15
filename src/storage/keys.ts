import { createHash } from 'node:crypto';

export type ProductionArea =
  | 'story'
  | 'characters'
  | 'environments'
  | 'props'
  | 'audio'
  | 'scenes'
  | 'renders'
  | 'subtitles'
  | 'thumbnails'
  | 'platform'
  | 'previews'
  | 'logs';

const SAFE_SEGMENT = /[^a-zA-Z0-9._-]/g;

export function safeSegment(value: string): string {
  const cleaned = value.replace(SAFE_SEGMENT, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 120) : 'unnamed';
}

export function productionPrefix(productionId: string): string {
  return `projects/${safeSegment(productionId)}`;
}

export function areaKey(productionId: string, area: ProductionArea, ...parts: string[]): string {
  return [productionPrefix(productionId), area, ...parts.map(safeSegment)].join('/');
}

export function shotClipKey(
  productionId: string,
  sceneId: string,
  shotId: string,
  fingerprint: string,
  ext = 'mp4'
): string {
  return areaKey(productionId, 'scenes', sceneId, `${shotId}.${fingerprint.slice(0, 12)}.${ext}`);
}

export function continuityFrameKey(productionId: string, sceneId: string, shotId: string): string {
  return areaKey(productionId, 'scenes', sceneId, `${shotId}.last.png`);
}

export function sceneRenderKey(
  productionId: string,
  sceneId: string,
  profile: string,
  ext = 'mp4'
): string {
  return areaKey(productionId, 'renders', `${sceneId}.${profile}.${ext}`);
}

export function masterKey(productionId: string, ext = 'mp4'): string {
  return areaKey(productionId, 'renders', `master.${ext}`);
}

export function variantKey(
  productionId: string,
  platform: string,
  format: string,
  ext = 'mp4'
): string {
  return areaKey(productionId, 'platform', `${platform}_${format.replace(':', 'x')}.${ext}`);
}

export function audioKey(productionId: string, kind: string, trackId: string, ext = 'wav'): string {
  return areaKey(productionId, 'audio', kind, `${trackId}.${ext}`);
}

export function subtitleKey(productionId: string, language: string, format: string): string {
  return areaKey(productionId, 'subtitles', `${language}.${format.toLowerCase()}`);
}

export function thumbnailKey(productionId: string, index: number, ext = 'jpg'): string {
  return areaKey(productionId, 'thumbnails', `candidate_${String(index).padStart(2, '0')}.${ext}`);
}

export function contentAddressedKey(kind: string, checksum: string, ext: string): string {
  return `library/${safeSegment(kind)}/${checksum.slice(0, 2)}/${checksum}.${safeSegment(ext)}`;
}

export function checksumOf(body: Buffer): string {
  return createHash('sha256').update(body).digest('hex');
}

export function cacheKeyOf(parts: Record<string, unknown>): string {
  const canonical = JSON.stringify(parts, Object.keys(parts).sort());
  return createHash('sha256').update(canonical).digest('hex');
}
