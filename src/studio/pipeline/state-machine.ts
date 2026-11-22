import { ProductionStatus } from '@prisma/client';
import { ConflictError } from '@/utils/http-error';

export const STAGE_ORDER: ProductionStatus[] = [
  'DRAFT',
  'PLANNING',
  'SCRIPT_READY',
  'ASSETS_GENERATING',
  'ASSETS_READY',
  'AUDIO_GENERATING',
  'AUDIO_READY',
  'ANIMATION_READY',
  'RENDERING',
  'POST_PROCESSING',
  'QUALITY_CHECK',
  'APPROVED',
  'PUBLISHING',
  'PUBLISHED',
];

const TRANSITIONS: Record<ProductionStatus, ProductionStatus[]> = {
  DRAFT: ['PLANNING', 'CANCELLED', 'FAILED'],
  PLANNING: ['SCRIPT_READY', 'FAILED', 'CANCELLED'],
  SCRIPT_READY: ['ASSETS_GENERATING', 'PLANNING', 'FAILED', 'CANCELLED'],
  ASSETS_GENERATING: ['ASSETS_READY', 'FAILED', 'RETRYING', 'CANCELLED'],
  ASSETS_READY: ['AUDIO_GENERATING', 'ASSETS_GENERATING', 'FAILED', 'CANCELLED'],
  AUDIO_GENERATING: ['AUDIO_READY', 'FAILED', 'RETRYING', 'CANCELLED'],
  AUDIO_READY: ['ANIMATION_READY', 'AUDIO_GENERATING', 'FAILED', 'CANCELLED'],
  ANIMATION_READY: ['RENDERING', 'FAILED', 'CANCELLED'],
  RENDERING: ['POST_PROCESSING', 'RENDERING', 'FAILED', 'RETRYING', 'CANCELLED'],
  POST_PROCESSING: ['QUALITY_CHECK', 'FAILED', 'RETRYING', 'CANCELLED'],
  QUALITY_CHECK: ['APPROVED', 'RENDERING', 'POST_PROCESSING', 'FAILED', 'CANCELLED'],
  APPROVED: ['PUBLISHING', 'QUALITY_CHECK', 'CANCELLED'],
  PUBLISHING: ['PUBLISHED', 'FAILED', 'RETRYING', 'CANCELLED'],
  PUBLISHED: [],
  FAILED: ['RETRYING', 'PLANNING', 'CANCELLED'],
  RETRYING: [
    'PLANNING',
    'ASSETS_GENERATING',
    'AUDIO_GENERATING',
    'RENDERING',
    'POST_PROCESSING',
    'PUBLISHING',
    'FAILED',
    'CANCELLED',
  ],
  CANCELLED: [],
};

export function canTransition(from: ProductionStatus, to: ProductionStatus): boolean {
  return from === to || (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: ProductionStatus, to: ProductionStatus): void {
  if (!canTransition(from, to)) {
    throw new ConflictError(`a production cannot move from ${from} to ${to}`);
  }
}

export function isTerminal(status: ProductionStatus): boolean {
  return status === 'PUBLISHED' || status === 'CANCELLED';
}

export function nextStage(status: ProductionStatus): ProductionStatus | null {
  const index = STAGE_ORDER.indexOf(status);
  if (index === -1 || index === STAGE_ORDER.length - 1) {
    return null;
  }
  return STAGE_ORDER[index + 1];
}

export function progressRatio(status: ProductionStatus): number {
  const index = STAGE_ORDER.indexOf(status);
  if (index === -1) {
    return status === 'PUBLISHED' ? 1 : 0;
  }
  return Number((index / (STAGE_ORDER.length - 1)).toFixed(3));
}
