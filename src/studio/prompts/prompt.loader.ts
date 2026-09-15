import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';

export interface LoadedPrompt {
  name: string;
  version: string;
  checksum: string;
  render(variables: Record<string, unknown>): string;
}

const cache = new Map<string, LoadedPrompt>();

function promptRoot(): string {
  return resolve(env.STUDIO_PROMPTS_DIR || join(process.cwd(), 'prompts'));
}

function interpolate(template: string, variables: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_match, key: string) => {
    const value = variables[key];
    if (value === undefined || value === null) {
      return '';
    }
    return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  });
}

export function loadPrompt(name: string, version = 'v1'): LoadedPrompt {
  const key = `${name}.${version}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }

  const path = join(promptRoot(), `${name}.${version}.md`);
  let template: string;
  try {
    template = readFileSync(path, 'utf8');
  } catch {
    throw new ServerError(`prompt template not found: ${key}`);
  }

  const prompt: LoadedPrompt = {
    name,
    version,
    checksum: createHash('sha256').update(template).digest('hex').slice(0, 16),
    render: variables => interpolate(template, variables),
  };

  cache.set(key, prompt);
  return prompt;
}

export function clearPromptCache(): void {
  cache.clear();
}
