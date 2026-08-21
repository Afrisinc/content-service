import {
  listBrandAssets,
  createBrandAsset,
  createBrandAssets,
  uploadBrandAssets,
  updateBrandAsset,
  addImagesToAsset,
  removeImageFromAsset,
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
          required: ['url'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', format: 'uri' },
            name: { type: 'string', maxLength: 120 },
            reference: { type: 'string', maxLength: 255 },
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
    '/brand-assets/upload',
    {
      schema: {
        tags: TAGS,
        description:
          'Upload photographs straight into the library. Each file is pushed to ' +
          'the assets service and stored by its public url, which is what the ' +
          'render service can actually reach.',
        body: {
          type: 'object',
          required: ['files'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 120 },
            // Applied to every photograph in the set.
            subjects: { type: 'array', items: { type: 'string' } },
            files: {
              type: 'array',
              minItems: 1,
              maxItems: 40,
              items: {
                type: 'object',
                required: ['filename', 'contentType', 'content'],
                additionalProperties: false,
                properties: {
                  filename: { type: 'string', minLength: 1, maxLength: 255 },
                  contentType: {
                    type: 'string',
                    enum: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
                  },
                  content: { type: 'string', minLength: 1 },
                },
              },
            },
          },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(uploadBrandAssets)
  );

  app.post(
    '/brand-assets/bulk',
    {
      schema: {
        tags: TAGS,
        description:
          'Add several photographs at once. A reference is derived from the url ' +
          'when none is given, and one already in the library is skipped rather ' +
          'than failing the batch.',
        body: {
          type: 'object',
          required: ['assets'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', maxLength: 120 },
            description: { type: 'string', maxLength: 280 },
            assets: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['url'],
                additionalProperties: false,
                properties: {
                  url: { type: 'string', format: 'uri' },
                  reference: { type: 'string', maxLength: 255 },
                  kind: { type: 'string', default: 'photo' },
                  subjects: { type: 'array', items: { type: 'string' } },
                  hasPerson: { type: 'boolean' },
                  subjectSide: { type: 'string', enum: ['left', 'center', 'right'] },
                  brightness: { type: 'string', enum: ['dark', 'medium', 'bright'] },
                },
              },
            },
          },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(createBrandAssets)
  );

  app.patch(
    '/brand-assets/:id',
    {
      schema: {
        tags: TAGS,
        description: 'Rename a set or change its description',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 120 },
            description: { type: 'string', maxLength: 280 },
          },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(updateBrandAsset)
  );

  app.post(
    '/brand-assets/:id/images',
    {
      schema: {
        tags: TAGS,
        description: 'Add photographs to a set that already exists',
        params: {
          type: 'object',
          required: ['id'],
          properties: { id: { type: 'string' } },
        },
        body: {
          type: 'object',
          required: ['images'],
          additionalProperties: false,
          properties: {
            images: {
              type: 'array',
              minItems: 1,
              maxItems: 100,
              items: {
                type: 'object',
                required: ['url'],
                additionalProperties: false,
                properties: {
                  url: { type: 'string', format: 'uri' },
                  reference: { type: 'string', maxLength: 255 },
                  subjects: { type: 'array', items: { type: 'string' } },
                  hasPerson: { type: 'boolean' },
                  subjectSide: { type: 'string', enum: ['left', 'center', 'right'] },
                  brightness: { type: 'string', enum: ['dark', 'medium', 'bright'] },
                },
              },
            },
          },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(addImagesToAsset)
  );

  app.delete(
    '/brand-assets/:id/images/:imageId',
    {
      schema: {
        tags: TAGS,
        description: 'Take one photograph out of a set',
        params: {
          type: 'object',
          required: ['id', 'imageId'],
          properties: { id: { type: 'string' }, imageId: { type: 'string' } },
        },
      },
      onRequest: [authGuard],
    },
    asyncWrapper(removeImageFromAsset)
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
