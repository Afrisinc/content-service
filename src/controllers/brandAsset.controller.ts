import { env } from '@/config/env';
import { getAssetsClient } from '@/utils/assets-client';
import {
  brandAssetRepository,
  type CreateBrandAssetImageInput,
} from '@/repositories/brandAsset.repository';
import { success } from '@/utils/response';
import { BadRequestError, NotFoundError } from '@/utils/http-error';
import { FastifyReply, FastifyRequest } from 'fastify';

interface CreateAssetPayload {
  url: string;
  reference: string;
  kind?: string;
  subjects?: string[];
  hasPerson?: boolean;
  subjectSide?: string;
  brightness?: string;
}

interface ApproveAssetPayload {
  approved: boolean;
}

export async function listBrandAssets(request: FastifyRequest, reply: FastifyReply) {
  const assets = await brandAssetRepository.findAll();
  return success(reply, 200, 'Brand assets retrieved', 1000, assets);
}

/** A reference the render service can resolve, derived from the image URL. */
export function referenceFromUrl(url: string, index: number): string {
  const filename = url.split('?')[0].split('/').pop() ?? '';
  const cleaned = filename
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return cleaned || `photo-${index + 1}`;
}

/** A set nobody named still needs one. */
function defaultSetName(count: number): string {
  const stamp = new Date().toISOString().slice(0, 10);
  return `${count} photograph${count === 1 ? '' : 's'} · ${stamp}`;
}

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

interface UploadedFile {
  filename: string;
  contentType: string;
  /** Base64 payload, with or without a `data:` prefix. */
  content: string;
}

/** Bytes of a base64 payload, tolerating a data-url prefix. */
export function decodeUpload(content: string): Buffer {
  const payload = content.includes(',') ? content.slice(content.indexOf(',') + 1) : content;
  return Buffer.from(payload, 'base64');
}

/**
 * Upload photographs straight into the library.
 *
 * The render service reads a photograph from a url it can reach, so an uploaded
 * file is pushed to the assets service first and the public url is what the
 * library stores — the same route rendered frames already take.
 *
 * Files arrive base64-encoded rather than as multipart: the installed
 * `@fastify/multipart` requires Fastify 5 and this service runs 4, and the
 * 512MB body limit in `app.ts` exists for exactly this.
 */
export async function uploadBrandAssets(request: FastifyRequest, reply: FastifyReply) {
  const { files } = request.body as { files: UploadedFile[] };

  if (!files?.length) {
    throw new BadRequestError('no photographs were sent');
  }

  const { name, subjects } = request.body as { name?: string; subjects?: string[] };

  const client = getAssetsClient();
  const prepared: CreateBrandAssetImageInput[] = [];
  const rejected: string[] = [];

  for (const file of files) {
    if (!IMAGE_TYPES.has(file.contentType)) {
      rejected.push(`${file.filename}: not an image`);
      continue;
    }

    const body = decodeUpload(file.content);
    if (!body.length) {
      rejected.push(`${file.filename}: empty file`);
      continue;
    }
    if (body.length > env.BRAND_ASSET_MAX_BYTES) {
      rejected.push(`${file.filename}: larger than the ${env.BRAND_ASSET_MAX_BYTES}-byte limit`);
      continue;
    }

    const reference = referenceFromUrl(file.filename, prepared.length);
    const asset = await client.uploadBuffer(body, file.filename, {
      tags: ['brand-asset', reference],
    });

    if (!asset?.url) {
      rejected.push(`${file.filename}: the assets service returned no url`);
      continue;
    }

    // `kind` and `approved` belong to the set, not to each photograph.
    prepared.push({ url: asset.url, reference, subjects });
  }

  if (!prepared.length) {
    throw new BadRequestError(
      rejected.length ? `nothing was stored — ${rejected[0]}` : 'no usable photographs were sent'
    );
  }

  const asset = await brandAssetRepository.create({
    name: name?.trim() || defaultSetName(prepared.length),
    kind: 'photo',
    approved: false,
    images: prepared,
  });

  return success(reply, 201, `${prepared.length} photograph(s) uploaded`, 1001, {
    added: prepared.length,
    rejected,
    asset,
  });
}

export async function createBrandAssets(request: FastifyRequest, reply: FastifyReply) {
  const { assets, name, description } = request.body as {
    assets: CreateAssetPayload[];
    name?: string;
    description?: string;
  };

  if (!assets?.length) {
    throw new BadRequestError('at least one asset is required');
  }

  const missingUrl = assets.find(asset => !asset.url?.trim());
  if (missingUrl) {
    throw new BadRequestError('every photograph needs a url');
  }

  // A pasted list rarely carries references, and typing one per photograph is
  // the reason libraries stay at a single image.
  const prepared: CreateBrandAssetImageInput[] = assets.map((asset, index) => ({
    url: asset.url,
    reference: asset.reference?.trim() || referenceFromUrl(asset.url, index),
    subjects: asset.subjects,
    hasPerson: asset.hasPerson,
    subjectSide: asset.subjectSide,
    brightness: asset.brightness,
  }));

  const asset = await brandAssetRepository.create({
    name: name?.trim() || defaultSetName(prepared.length),
    description: description?.trim(),
    kind: 'photo',
    approved: false,
    images: prepared,
  });

  return success(reply, 201, `${prepared.length} photograph(s) added`, 1001, {
    added: prepared.length,
    asset,
  });
}

/** One photograph, still supported — it becomes a set holding a single image. */
export async function createBrandAsset(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.body as CreateAssetPayload & { name?: string };

  if (!payload.url) {
    throw new BadRequestError('url is required');
  }

  const reference = payload.reference?.trim() || referenceFromUrl(payload.url, 0);

  const existing = await brandAssetRepository.findByReference(reference);
  if (existing) {
    throw new BadRequestError('a photograph with this reference already exists');
  }

  const asset = await brandAssetRepository.create({
    name: payload.name?.trim() || reference,
    kind: payload.kind || 'photo',
    approved: false,
    images: [
      {
        url: payload.url,
        reference,
        subjects: payload.subjects,
        hasPerson: payload.hasPerson,
        subjectSide: payload.subjectSide,
        brightness: payload.brightness,
      },
    ],
  });

  return success(reply, 201, 'Brand asset created', 1001, asset);
}

/** Adds photographs to a set that already exists. */
export async function addImagesToAsset(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { images } = request.body as { images: CreateAssetPayload[] };

  const asset = await brandAssetRepository.findById(id);
  if (!asset) {
    throw new NotFoundError('asset not found');
  }

  const prepared: CreateBrandAssetImageInput[] = images.map((image, index) => ({
    url: image.url,
    reference: image.reference?.trim() || referenceFromUrl(image.url, index),
    subjects: image.subjects,
    hasPerson: image.hasPerson,
    subjectSide: image.subjectSide,
    brightness: image.brightness,
  }));

  const updated = await brandAssetRepository.addImages(id, prepared);
  return success(reply, 200, `${prepared.length} photograph(s) added`, 1002, updated);
}

export async function removeImageFromAsset(request: FastifyRequest, reply: FastifyReply) {
  const { imageId } = request.params as { id: string; imageId: string };

  const removed = await brandAssetRepository.removeImage(imageId);
  if (removed.count === 0) {
    throw new NotFoundError('photograph not found');
  }

  return success(reply, 200, 'Photograph removed', 1003, {});
}

export async function updateBrandAsset(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { name, description } = request.body as { name?: string; description?: string };

  const asset = await brandAssetRepository.findById(id);
  if (!asset) {
    throw new NotFoundError('asset not found');
  }

  const updated = await brandAssetRepository.update(id, {
    ...(name !== undefined ? { name: name.trim() } : {}),
    ...(description !== undefined ? { description: description.trim() || null } : {}),
  });

  return success(reply, 200, 'Brand asset updated', 1002, updated);
}

export async function approveBrandAsset(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };
  const { approved } = request.body as ApproveAssetPayload;

  const asset = await brandAssetRepository.findById(id);
  if (!asset) {
    throw new NotFoundError('asset not found');
  }

  const updated = await brandAssetRepository.approve(id, approved);
  return success(reply, 200, `Asset ${approved ? 'approved' : 'rejected'}`, 1002, updated);
}

export async function deleteBrandAsset(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string };

  const asset = await brandAssetRepository.findById(id);
  if (!asset) {
    throw new NotFoundError('asset not found');
  }

  await brandAssetRepository.delete(id);
  return success(reply, 200, 'Asset deleted', 1002);
}
