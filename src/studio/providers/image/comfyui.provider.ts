import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import axios, { type AxiosInstance } from 'axios';
import { randomUUID } from 'node:crypto';
import { env } from '@/config/env';
import { ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { recordGeneration } from '@/observability/metrics';
import type { ImageGenerationInput, ImageGenerationResult, ImageProvider } from '../provider.types';

interface ComfyHistoryEntry {
  outputs: Record<
    string,
    { images?: Array<{ filename: string; subfolder: string; type: string }> }
  >;
  status?: { completed?: boolean; status_str?: string };
}

type ComfyWorkflow = Record<string, { inputs: Record<string, unknown>; class_type: string }>;

const workflowCache = new Map<string, ComfyWorkflow>();

function loadWorkflow(name: string): ComfyWorkflow {
  const cached = workflowCache.get(name);
  if (cached) {
    return structuredClone(cached);
  }
  const path = join(resolve(env.STUDIO_COMFY_WORKFLOW_DIR), `${name}.json`);
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as ComfyWorkflow;
    workflowCache.set(name, parsed);
    return structuredClone(parsed);
  } catch {
    throw new ServerError(`comfy workflow not found: ${name}`);
  }
}

function applyInputs(
  workflow: ComfyWorkflow,
  input: ImageGenerationInput,
  seed: number
): ComfyWorkflow {
  for (const node of Object.values(workflow)) {
    const inputs = node.inputs;
    if ('seed' in inputs) {
      inputs.seed = seed;
    }
    if ('noise_seed' in inputs) {
      inputs.noise_seed = seed;
    }
    if ('width' in inputs) {
      inputs.width = input.width;
    }
    if ('height' in inputs) {
      inputs.height = input.height;
    }
    if ('steps' in inputs) {
      inputs.steps = input.steps ?? env.STUDIO_IMAGE_STEPS;
    }
    if ('cfg' in inputs) {
      inputs.cfg = input.cfgScale ?? env.STUDIO_IMAGE_CFG;
    }
    if (node.class_type === 'CLIPTextEncode' && typeof inputs.text === 'string') {
      inputs.text = inputs.text === '__NEGATIVE__' ? (input.negativePrompt ?? '') : input.prompt;
    }
  }
  return workflow;
}

export class ComfyUiImageProvider implements ImageProvider {
  readonly name = 'comfyui';
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: env.COMFYUI_BASE_URL,
      timeout: env.STUDIO_IMAGE_TIMEOUT_MS,
    });
  }

  async generate(input: ImageGenerationInput): Promise<ImageGenerationResult> {
    const startedAt = Date.now();
    const seed = input.seed ?? Math.floor(Math.random() * 2_147_483_647);
    const clientId = randomUUID();
    const workflow = applyInputs(
      loadWorkflow(input.workflow ?? env.STUDIO_COMFY_DEFAULT_WORKFLOW),
      input,
      seed
    );

    const queued = await this.client.post<{ prompt_id: string }>('/prompt', {
      prompt: workflow,
      client_id: clientId,
    });

    const promptId = queued.data.prompt_id;
    const entry = await this.waitForCompletion(promptId);
    const images = await this.collectImages(entry);

    if (images.length === 0) {
      throw new ServerError('comfyui produced no images');
    }

    const durationMs = Date.now() - startedAt;
    recordGeneration('image', this.name, durationMs);

    return {
      images,
      mimeType: input.transparent ? 'image/png' : 'image/png',
      seed,
      usage: {
        provider: this.name,
        model: input.workflow ?? env.STUDIO_COMFY_DEFAULT_WORKFLOW,
        seed,
        durationMs,
      },
    };
  }

  private async waitForCompletion(promptId: string): Promise<ComfyHistoryEntry> {
    const deadline = Date.now() + env.STUDIO_IMAGE_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const history = await this.client.get<Record<string, ComfyHistoryEntry>>(
        `/history/${promptId}`
      );
      const entry = history.data[promptId];
      if (entry) {
        if (entry.status?.status_str === 'error') {
          throw new ServerError('comfyui workflow failed');
        }
        if (entry.outputs && Object.keys(entry.outputs).length > 0) {
          return entry;
        }
      }
      await new Promise(done => setTimeout(done, env.STUDIO_IMAGE_POLL_MS));
    }
    throw new ServerError(`comfyui timed out on prompt ${promptId}`);
  }

  private async collectImages(entry: ComfyHistoryEntry): Promise<Buffer[]> {
    const buffers: Buffer[] = [];
    for (const output of Object.values(entry.outputs)) {
      for (const image of output.images ?? []) {
        const file = await this.client.get<ArrayBuffer>('/view', {
          params: { filename: image.filename, subfolder: image.subfolder, type: image.type },
          responseType: 'arraybuffer',
        });
        buffers.push(Buffer.from(file.data));
      }
    }
    return buffers;
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/system_stats', { timeout: 5000 });
      return response.status === 200;
    } catch (err) {
      logger.warn({ error: String(err) }, 'comfyui health check failed');
      return false;
    }
  }
}
