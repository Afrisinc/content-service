export const CLAUDE_NODE_NAME = 'claude';
export const CLAUDE_CREDENTIALS_NAME = 'claudeApi';

export const CLAUDE_RESOURCE = {
  TEXT: 'text',
  IMAGE: 'image',
  FILE: 'file',
} as const;

export const CLAUDE_OPERATION = {
  MESSAGE: 'message',
  CLASSIFY: 'classify',
  ANALYZE: 'analyze',
  GENERATE: 'generate',
} as const;

export type ClaudeResource = (typeof CLAUDE_RESOURCE)[keyof typeof CLAUDE_RESOURCE];
export type ClaudeOperation = (typeof CLAUDE_OPERATION)[keyof typeof CLAUDE_OPERATION];

export const DEFAULT_MODEL = 'claude-opus-5';
/** Keeps a non-streaming response inside the SDK's HTTP timeout; raise it when streaming. */
export const DEFAULT_MAX_TOKENS = 16000;
export const CLASSIFY_MAX_TOKENS = 1024;
export const DEFAULT_REQUEST_TIMEOUT_MS = 600000;

/** Server-side refusal fallbacks: the API retries a declined request on another model. */
export const REFUSAL_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const CODE_EXECUTION_BETA = 'code-execution-2025-08-25';
export const SKILLS_BETA = 'skills-2025-10-02';
export const FILES_BETA = 'files-api-2025-04-14';

export const DEFAULT_CODE_EXECUTION_TOOL = 'code_execution_20260521';

export const CODE_EXECUTION_TOOL_OPTIONS = [
  { name: 'Latest (2026-05-21)', value: 'code_execution_20260521' },
  { name: 'REPL persistence (2026-01-20)', value: 'code_execution_20260120' },
];

/**
 * A server tool that needs more time returns `pause_turn`; the conversation is resumed
 * rather than truncated. Bounded so a stuck loop cannot bill forever.
 */
export const MAX_SERVER_TOOL_TURNS = 5;

export const CLAUDE_MODEL_OPTIONS = [
  { name: 'Claude Opus 5', value: 'claude-opus-5', description: 'Default. 1M context' },
  { name: 'Claude Fable 5', value: 'claude-fable-5', description: 'Most capable, highest cost' },
  { name: 'Claude Sonnet 5', value: 'claude-sonnet-5', description: 'Cheaper, still 1M context' },
  { name: 'Claude Opus 4.8', value: 'claude-opus-4-8' },
  { name: 'Claude Haiku 4.5', value: 'claude-haiku-4-5', description: 'Fastest, 200K context' },
];

export const EFFORT_OPTIONS = [
  { name: 'Low', value: 'low' },
  { name: 'Medium', value: 'medium' },
  { name: 'High', value: 'high' },
  { name: 'Extra High', value: 'xhigh' },
  { name: 'Max', value: 'max' },
];

export const THINKING_OPTIONS = [
  { name: 'Adaptive', value: 'adaptive', description: 'Claude decides when and how deeply' },
  { name: 'Disabled', value: 'disabled', description: 'Rejected above high effort' },
];
