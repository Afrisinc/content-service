import { Prisma } from '@prisma/client';
import { BadRequestError, NotFoundError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { productionRepository } from '@/repositories/production.repository';
import { productionAssetRepository } from '@/repositories/productionAsset.repository';
import { productionJobRepository } from '@/repositories/productionJob.repository';
import type {
  AnimationModeContract,
  CharacterBible,
  EnvironmentBible,
  SceneSpec,
  Story,
} from '@/studio/contracts';
import {
  characterPromptVersion,
  cinematographyPromptVersion,
  directCharacters,
  directEnvironments,
  directScene,
  directSceneAnimation,
  directStory,
  environmentPromptVersion,
  moderate,
  storyPromptVersion,
} from '@/studio/directors';
import type { SpokenLine } from '@/studio/directors/animation.director';

const MODE_MAP: Record<string, AnimationModeContract> = {
  TWO_D: '2d',
  HYBRID: 'hybrid',
  THREE_D: '3d',
};

export class ProductionStoryService {
  async planStory(productionId: string): Promise<Story> {
    const production = await productionRepository.findById(productionId);
    if (!production) {
      throw new NotFoundError('production not found');
    }

    const inputVerdict = await moderate(
      { idea: production.idea, genre: production.genre },
      production.contentRestrictions,
      production.audience ?? 'general audience'
    );
    if (!inputVerdict.allowed) {
      throw new BadRequestError(`the brief failed moderation: ${inputVerdict.reasons.join('; ')}`);
    }

    const result = await directStory({
      idea: production.idea,
      genre: production.genre ?? undefined,
      language: production.language,
      audience: production.audience ?? undefined,
      visualStyle: production.visualStyle,
      targetDurationSeconds: production.targetDurationSeconds,
      contentRestrictions: production.contentRestrictions,
    });

    const storyVerdict = await moderate(
      result.data,
      production.contentRestrictions,
      production.audience ?? 'general audience'
    );
    if (!storyVerdict.allowed) {
      throw new BadRequestError(`the story failed moderation: ${storyVerdict.reasons.join('; ')}`);
    }

    await productionRepository.upsertStory(productionId, {
      title: result.data.title,
      logline: result.data.logline,
      synopsis: result.data.synopsis,
      spec: result.data as unknown as Prisma.InputJsonValue,
      targetDurationSeconds: result.data.target_duration_seconds,
      moderationVerdict: storyVerdict.severity,
      moderationReport: storyVerdict as unknown as Prisma.InputJsonValue,
    });

    await productionRepository.mergeReproducibility(productionId, {
      story_prompt: storyPromptVersion(),
      story_model: result.usage[0]?.model,
      story_provider: result.usage[0]?.provider,
      story_attempts: result.attempts,
    });

    logger.info({ productionId, scenes: result.data.scenes.length }, 'studio.story.planned');
    return result.data;
  }

  async buildBibles(
    productionId: string
  ): Promise<{ characters: CharacterBible[]; environments: EnvironmentBible[] }> {
    const production = await productionRepository.findById(productionId);
    const stored = await productionRepository.getStory(productionId);
    if (!production || !stored) {
      throw new NotFoundError('this production has no story yet');
    }

    const story = stored.spec as unknown as Story;

    const [characterResult, environmentResult] = await Promise.all([
      directCharacters(story, production.visualStyle),
      directEnvironments(story, production.visualStyle),
    ]);

    for (const character of characterResult.data.characters) {
      await productionAssetRepository.upsertCharacter(
        productionId,
        character.slug,
        character.name,
        character as unknown as Prisma.InputJsonValue
      );
    }

    for (const environment of environmentResult.data.environments) {
      await productionAssetRepository.upsertEnvironment(
        productionId,
        environment.slug,
        environment.name,
        environment as unknown as Prisma.InputJsonValue
      );
    }

    for (const prop of environmentResult.data.props) {
      await productionAssetRepository.upsertProp(
        productionId,
        prop.slug,
        prop.name,
        prop as unknown as Prisma.InputJsonValue
      );
    }

    await productionRepository.mergeReproducibility(productionId, {
      character_prompt: characterPromptVersion(),
      environment_prompt: environmentPromptVersion(),
    });

    logger.info(
      {
        productionId,
        characters: characterResult.data.characters.length,
        environments: environmentResult.data.environments.length,
      },
      'studio.bibles.built'
    );

    return {
      characters: characterResult.data.characters,
      environments: environmentResult.data.environments,
    };
  }

  async planScenes(productionId: string): Promise<SceneSpec[]> {
    const production = await productionRepository.findById(productionId);
    const stored = await productionRepository.getStory(productionId);
    if (!production || !stored) {
      throw new NotFoundError('this production has no story yet');
    }

    const story = stored.spec as unknown as Story;
    const characters = (await productionAssetRepository.charactersFor(productionId))
      .map(character => character.versions[0]?.spec as unknown as CharacterBible)
      .filter(Boolean);

    const mode = MODE_MAP[production.animationMode] ?? '3d';
    const environments = await productionAssetRepository.environmentsFor(productionId);
    const environmentIdBySlug = new Map(
      environments.map(environment => [environment.slug, environment.id] as const)
    );

    const planned: SceneSpec[] = [];

    for (const storyScene of story.scenes) {
      const result = await directScene(storyScene, characters, mode);
      const withAnimation = await directSceneAnimation(
        result.data,
        linesByShot(result.data, storyScene)
      );

      const environmentSlug = storyScene.environment_id.replace(/_v\d+$/, '');
      const scene = await productionJobRepository.upsertScene(
        productionId,
        withAnimation.scene_id,
        {
          index: withAnimation.index,
          durationSeconds: withAnimation.duration_seconds,
          environmentId: environmentIdBySlug.get(environmentSlug) ?? null,
          spec: withAnimation as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        }
      );

      await productionJobRepository.replaceShots(
        scene.id,
        withAnimation.shots.map(shot => ({
          sceneId: scene.id,
          index: shot.index,
          shotId: shot.shot_id,
          durationSeconds: shot.duration_seconds,
          camera: shot.camera as unknown as Prisma.InputJsonValue,
          characters: shot.characters as unknown as Prisma.InputJsonValue,
          audio: shot.audio as unknown as Prisma.InputJsonValue,
          spec: shot as unknown as Prisma.InputJsonValue,
        }))
      );

      planned.push(withAnimation);
    }

    await productionRepository.mergeReproducibility(productionId, {
      cinematography_prompt: cinematographyPromptVersion(),
    });

    logger.info({ productionId, scenes: planned.length }, 'studio.scenes.planned');
    return planned;
  }
}

function linesByShot(
  scene: SceneSpec,
  storyScene: Story['scenes'][number]
): Record<string, SpokenLine[]> {
  const lines: SpokenLine[] = [
    ...storyScene.narration.map(line => ({
      line_id: line.line_id,
      text: line.text,
      start: 0,
      duration: 0,
    })),
    ...storyScene.dialogue.map(line => ({
      line_id: line.line_id,
      character_id: line.character_id,
      text: line.text,
      start: 0,
      duration: 0,
    })),
  ];

  if (lines.length === 0 || scene.shots.length === 0) {
    return {};
  }

  const perShot = Math.ceil(lines.length / scene.shots.length);
  const mapping: Record<string, SpokenLine[]> = {};

  scene.shots.forEach((shot, index) => {
    const slice = lines.slice(index * perShot, (index + 1) * perShot);
    const span = slice.length > 0 ? shot.duration_seconds / slice.length : 0;
    mapping[shot.shot_id] = slice.map((line, position) => ({
      ...line,
      start: Number((position * span).toFixed(2)),
      duration: Number(span.toFixed(2)),
    }));
  });

  return mapping;
}

export const productionStoryService = new ProductionStoryService();
