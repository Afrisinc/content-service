import type { ZodTypeAny, z } from 'zod';
import { env } from '@/config/env';
import { BadRequestError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { getLlmProvider } from '../providers';
import type { GenerationUsage } from '../providers/provider.types';

export interface StructuredRequest<T extends ZodTypeAny> {
  stage: string;
  prompt: string;
  schema: T;
  system?: string;
  maxTokens?: number;
  temperature?: number;
  maxAttempts?: number;
}

export interface StructuredResult<T> {
  data: T;
  attempts: number;
  usage: GenerationUsage[];
}

const FENCE = /^```(?:json)?\s*([\s\S]*?)\s*```$/m;

export function extractJson(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(FENCE);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const firstObject = candidate.indexOf('{');
  const firstArray = candidate.indexOf('[');
  const start =
    firstObject === -1
      ? firstArray
      : firstArray === -1
        ? firstObject
        : Math.min(firstObject, firstArray);
  if (start === -1) {
    return candidate;
  }

  const opener = candidate[start];
  const closer = opener === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < candidate.length; index += 1) {
    const char = candidate[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) {
      continue;
    }
    if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) {
        return candidate.slice(start, index + 1);
      }
    }
  }

  return candidate.slice(start);
}

function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 12)
    .map(issue => `- ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

export async function generateStructured<T extends ZodTypeAny>(
  request: StructuredRequest<T>
): Promise<StructuredResult<z.infer<T>>> {
  const provider = getLlmProvider();
  const maxAttempts = request.maxAttempts ?? env.STUDIO_STRUCTURED_MAX_ATTEMPTS;
  const usage: GenerationUsage[] = [];

  let prompt = request.prompt;
  let lastProblem = '';

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await provider.complete({
      system: request.system,
      prompt,
      jsonOnly: true,
      maxTokens: request.maxTokens,
      temperature: attempt === 1 ? request.temperature : 0,
    });
    usage.push(response.usage);

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(response.text));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      lastProblem = `the response was not valid JSON: ${detail}`;
      prompt =
        `${request.prompt}\n\nYour previous reply could not be parsed. ${lastProblem}\n` +
        'Return only the JSON object.';
      logger.warn({ stage: request.stage, attempt }, 'studio.structured.parse_failed');
      continue;
    }

    const validated = request.schema.safeParse(parsed);
    if (validated.success) {
      return { data: validated.data, attempts: attempt, usage };
    }

    lastProblem = describeIssues(validated.error);
    prompt =
      `${request.prompt}\n\nYour previous reply failed validation:\n${lastProblem}\n\n` +
      'Fix exactly these problems and return only the corrected JSON.';
    logger.warn(
      { stage: request.stage, attempt, problems: lastProblem },
      'studio.structured.validation_failed'
    );
  }

  throw new BadRequestError(
    `${request.stage} could not produce valid output after ${maxAttempts} attempts: ${lastProblem}`
  );
}
