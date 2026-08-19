import {
  listBrandAssets,
  createBrandAsset,
  approveBrandAsset,
  deleteBrandAsset,
} from '@/controllers/brandAsset.controller';
import { asyncWrapper } from '@/middlewares/async_wrapper.middleware';
import { authGuard } from '@/middlewares/authGuard';
import { FastifyInstance } from 'fastify';

const TAGS = ['brand-assets'];

export async function brandAssetRoutes(app: FastifyInstance) {
  app.get(
    '/brand-assets',
    { schema: { tags: TAGS }, onRequest: [authGuard] },
    asyncWrapper(listBrandAssets)
  );

  app.post(
    '/brand-assets',
    {
      schema: {
        tags: TAGS,
        body: {
          type: 'object',
          required: ['url', 'reference'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', format: 'uri' },
            reference: { type: 'string', minLength: 1, maxLength: 255 },
            kind: { type: 'string', default: 'photo' },
            subjects: { type: 'array', items: { type: 'string' } },
            hasPerson: { type: 'boolean' },
            subjectSide: { type: 'string', enum: ['left', 'center', 'right'] },
            brightness: { type: 'string', enum: ['dark', 'medium', 'bright'] },
          },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(createBrandAsset)
  );

  app.post(
    '/brand-assets/:id/approve',
    {
      schema: {
        tags: TAGS,
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['approved'],
          additionalProperties: false,
          properties: {
            approved: { type: 'boolean' },
          },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(approveBrandAsset)
  );

  app.delete(
    '/brand-assets/:id',
    {
      schema: {
        tags: TAGS,
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(deleteBrandAsset)
  );
}
