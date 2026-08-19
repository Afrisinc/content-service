import { brandAssetRepository } from '@/repositories/brandAsset.repository';
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

export async function createBrandAsset(request: FastifyRequest, reply: FastifyReply) {
  const payload = request.body as CreateAssetPayload;

  if (!payload.url || !payload.reference) {
    throw new BadRequestError('url and reference are required');
  }

  const existing = await brandAssetRepository.findByReference(payload.reference);
  if (existing) {
    throw new BadRequestError('asset with this reference already exists');
  }

  const asset = await brandAssetRepository.create({
    ...payload,
    kind: payload.kind || 'photo',
    approved: false,
  });

  return success(reply, 201, 'Brand asset created', 1001, asset);
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
