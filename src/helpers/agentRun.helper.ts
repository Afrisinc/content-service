/**
 * The stages a post agent run passes through, in order. Seeded on every run so
 * the UI can draw the whole pipeline before any of it has happened.
 */
export const AGENT_STEP_KEYS = {
  brief: 'brief',
  copy: 'copy',
  art: 'art',
  render: 'render',
  audit: 'audit',
  assets: 'assets',
  queue: 'queue',
  approval: 'approval',
  release: 'release',
} as const;

export type AgentStepKey = (typeof AGENT_STEP_KEYS)[keyof typeof AGENT_STEP_KEYS];

export interface AgentStepDefinition {
  key: AgentStepKey;
  label: string;
  sequence: number;
}

export const POST_AGENT_STEPS: ReadonlyArray<AgentStepDefinition> = [
  { key: AGENT_STEP_KEYS.brief, label: 'Brief', sequence: 0 },
  { key: AGENT_STEP_KEYS.copy, label: 'Write', sequence: 1 },
  { key: AGENT_STEP_KEYS.art, label: 'Art direction', sequence: 2 },
  { key: AGENT_STEP_KEYS.render, label: 'Render', sequence: 3 },
  { key: AGENT_STEP_KEYS.audit, label: 'Craft audit', sequence: 4 },
  { key: AGENT_STEP_KEYS.assets, label: 'Publish frames', sequence: 5 },
  { key: AGENT_STEP_KEYS.queue, label: 'Queue', sequence: 6 },
  { key: AGENT_STEP_KEYS.approval, label: 'Approval', sequence: 7 },
  { key: AGENT_STEP_KEYS.release, label: 'Release', sequence: 8 },
];

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Working state for a run, held in Redis so a failure can pick up where it
 * stopped rather than paying for the copy agent twice. Everything here is a
 * cache: losing it costs a redo, never correctness.
 */
export const RUN_STATE_KEYS = {
  brief: 'brief',
  copy: 'copy',
  art: 'art',
} as const;

export type RunStateKey = (typeof RUN_STATE_KEYS)[keyof typeof RUN_STATE_KEYS];

/**
 * Cached state outlives the code that wrote it — an entry survives a deploy for
 * a whole TTL. A resume serving an old payload into new code is a nasty bug,
 * because it reads as "the fix did not work" rather than as a stale cache.
 *
 * **Bump a stage's version whenever the shape or meaning of what it caches
 * changes.** Its old entries then simply miss and that stage runs again, which
 * costs one redo and nothing else.
 *
 * Versioned per stage rather than globally so that retiring one stage does not
 * throw away another — the copy is the expensive one, and it is usually still
 * perfectly good when something downstream changes.
 *
 * Version 1 is the original un-suffixed key, so a stage that has never changed
 * keeps reading what earlier runs already wrote.
 */
export const RUN_STATE_VERSIONS: Record<RunStateKey, number> = {
  [RUN_STATE_KEYS.brief]: 1,
  [RUN_STATE_KEYS.copy]: 1,
  // 2 — art direction moved from bare filenames to photograph urls.
  [RUN_STATE_KEYS.art]: 2,
};

export function runStateKey(runId: string, part: RunStateKey): string {
  const version = RUN_STATE_VERSIONS[part];
  const base = `agent:run:${runId}:${part}`;
  return version === 1 ? base : `${base}.v${version}`;
}
