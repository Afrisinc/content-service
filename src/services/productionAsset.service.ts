import { Prisma, StudioAssetKind } from '@prisma/client';
import { env } from '@/config/env';
import { NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { productionAssetRepository } from '@/repositories/productionAsset.repository';
import { productionRepository } from '@/repositories/production.repository';
import { areaKey, checksumOf, contentAddressedKey, getObjectStorage } from '@/storage';
import type { CharacterBible, EnvironmentBible } from '@/studio/contracts';
import { getImageProvider } from '@/studio/providers';
import { assetCacheKey } from '@/studio/pipeline/cache';

const NEGATIVE = [
  'blurry',
  'low quality',
  'watermark',
  'text',
  'signature',
  'extra limbs',
  'deformed hands',
  'duplicate',
  'jpeg artifacts',
].join(', ');

function characterPrompt(character: CharacterBible, style: string): string {
  const appearance = character.appearance;
  return [
    `full body character sheet of ${character.name}`,
    character.age ? `${character.age} years old` : '',
    character.gender_presentation ?? '',
    `${appearance.hair} hair`,
    `${appearance.eyes} eyes`,
    `${appearance.skin} skin`,
    appearance.build ? `${appearance.build} build` : '',
    `wearing ${appearance.clothing}`,
    ...appearance.distinguishing_features,
    style,
    'neutral pose, front facing, plain background, consistent character design',
  ]
    .filter(Boolean)
    .join(', ');
}

function environmentPrompt(environment: EnvironmentBible, style: string, layer?: string): string {
  return [
    layer ? `${layer} layer of` : '',
    environment.name,
    environment.description,
    `${environment.time_of_day}`,
    `${environment.weather} weather`,
    environment.mood ?? '',
    environment.key_light ? `lit by ${environment.key_light}` : '',
    style,
    layer ? 'transparent background, isolated layer' : 'establishing wide view, no characters',
  ]
    .filter(Boolean)
    .join(', ');
}

export class ProductionAssetService {
  async generateForProduction(
    productionId: string
  ): Promise<{ characters: number; environments: number }> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const characters = await productionAssetRepository.charactersFor(productionId);
    const environments = await productionAssetRepository.environmentsFor(productionId);

    let characterCount = 0;
    for (const character of characters) {
      const version = character.versions[0];
      if (!version) {
        continue;
      }
      const bible = version.spec as unknown as CharacterBible;
      const keys = await this.generate({
        productionId,
        kind: 'CHARACTER',
        slug: character.slug,
        prompt: characterPrompt(bible, production.visualStyle),
        width: env.STUDIO_CHARACTER_WIDTH,
        height: env.STUDIO_CHARACTER_HEIGHT,
        transparent: true,
      });
      await productionAssetRepository.attachCharacterAssets(
        version.id,
        keys.storageKeys,
        keys.generator
      );
      characterCount += 1;
    }

    let environmentCount = 0;
    for (const environment of environments) {
      const version = environment.versions[0];
      if (!version) {
        continue;
      }
      const bible = version.spec as unknown as EnvironmentBible;
      const storageKeys: string[] = [];

      const base = await this.generate({
        productionId,
        kind: 'ENVIRONMENT',
        slug: environment.slug,
        prompt: environmentPrompt(bible, production.visualStyle),
        width: env.STUDIO_ENVIRONMENT_WIDTH,
        height: env.STUDIO_ENVIRONMENT_HEIGHT,
      });
      storageKeys.push(...base.storageKeys);

      if (production.animationMode !== 'THREE_D') {
        for (const layer of bible.layers) {
          const generated = await this.generate({
            productionId,
            kind: 'ENVIRONMENT',
            slug: `${environment.slug}-${layer}`,
            prompt: environmentPrompt(bible, production.visualStyle, layer),
            width: env.STUDIO_ENVIRONMENT_WIDTH,
            height: env.STUDIO_ENVIRONMENT_HEIGHT,
            transparent: layer !== 'sky',
          });
          storageKeys.push(...generated.storageKeys);
        }
      }

      await productionAssetRepository.attachEnvironmentAssets(
        version.id,
        storageKeys,
        base.generator
      );
      environmentCount += 1;
    }

    logger.info({ productionId, characterCount, environmentCount }, 'studio.assets.generated');
    return { characters: characterCount, environments: environmentCount };
  }

  async generate(input: {
    productionId: string;
    kind: StudioAssetKind;
    slug: string;
    prompt: string;
    width: number;
    height: number;
    seed?: number;
    transparent?: boolean;
  }): Promise<{ storageKeys: string[]; generator: Prisma.InputJsonValue }> {
    const provider = getImageProvider();
    const storage = getObjectStorage();

    const cacheKey = assetCacheKey({
      prompt: input.prompt,
      negativePrompt: NEGATIVE,
      model: env.STUDIO_COMFY_DEFAULT_WORKFLOW,
      seed: input.seed,
      width: input.width,
      height: input.height,
    });

    const existing = await productionAssetRepository.findAssetByChecksum(cacheKey, input.kind);
    if (existing) {
      logger.info({ slug: input.slug, key: existing.storageKey }, 'studio.asset.cache_hit');
      return {
        storageKeys: [existing.storageKey],
        generator: (existing.generator ?? {}) as Prisma.InputJsonValue,
      };
    }

    const result = await provider.generate({
      prompt: input.prompt,
      negativePrompt: NEGATIVE,
      width: input.width,
      height: input.height,
      seed: input.seed,
      transparent: input.transparent,
    });

    const generator: Prisma.InputJsonValue = {
      provider: provider.name,
      model: env.STUDIO_COMFY_DEFAULT_WORKFLOW,
      prompt: input.prompt,
      negative_prompt: NEGATIVE,
      seed: result.seed,
      parameters: { width: input.width, height: input.height, steps: env.STUDIO_IMAGE_STEPS },
      generated_at: new Date().toISOString(),
      cache_key: cacheKey,
    };

    const storageKeys: string[] = [];

    for (const [index, image] of result.images.entries()) {
      const checksum = checksumOf(image);
      const key =
        index === 0
          ? areaKey(
              input.productionId,
              input.kind === 'CHARACTER' ? 'characters' : 'environments',
              `${input.slug}.png`
            )
          : contentAddressedKey(input.kind.toLowerCase(), checksum, 'png');

      await storage.putIfAbsent({
        key,
        body: image,
        contentType: 'image/png',
        metadata: { slug: input.slug, seed: String(result.seed) },
      });
      storageKeys.push(key);

      if (index === 0) {
        await productionAssetRepository.createAsset({
          productionId: input.productionId,
          kind: input.kind,
          slug: input.slug,
          storageKey: key,
          mimeType: 'image/png',
          bytes: image.byteLength,
          checksum: cacheKey,
          width: input.width,
          height: input.height,
          generator,
        });
      }
    }

    return { storageKeys, generator };
  }
}

export const productionAssetService = new ProductionAssetService();
