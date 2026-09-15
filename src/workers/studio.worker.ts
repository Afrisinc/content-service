import { env } from '@/config/env';
import { logger } from '@/utils/logger';
import { closeQueues, registeredQueues, startConsumers, type StudioQueue } from '@/queues';
import { registerStudioHandlers } from '@/queues/handlers';

const ROLES: Record<string, StudioQueue[]> = {
  story: ['story.generate', 'story.validate'],
  assets: ['asset.generate', 'asset.validate'],
  audio: ['audio.generate'],
  animation: ['animation.plan', 'animation.render.2d'],
  video: ['animation.render.ai'],
  quality: ['video.encode', 'qa.approve', 'qa.reject'],
  publisher: ['publish.youtube', 'publish.instagram', 'publish.facebook', 'publish.tiktok'],
};

function queuesForRole(role: string): StudioQueue[] {
  if (role === 'all') {
    return Object.values(ROLES).flat();
  }
  const queues = ROLES[role];
  if (!queues) {
    throw new Error(`unknown studio worker role: ${role}`);
  }
  return queues;
}

async function main(): Promise<void> {
  const role = process.argv[2] ?? env.STUDIO_WORKER_ROLE;
  registerStudioHandlers();

  const queues = queuesForRole(role).filter(queue => registeredQueues().includes(queue));
  await startConsumers(queues);

  logger.info({ role, queues }, 'studio.worker.started');

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'studio.worker.stopping');
    await closeQueues();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch(err => {
  logger.error(
    { error: err instanceof Error ? err.message : String(err) },
    'studio.worker.crashed'
  );
  process.exit(1);
});
