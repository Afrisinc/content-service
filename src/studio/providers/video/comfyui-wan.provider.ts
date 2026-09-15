import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import axios, { type AxiosInstance, isAxiosError } from 'axios';
import FormData from 'form-data';
import { env } from '@/config/env';
import { BadRequestError, ServerError } from '@/utils/http-error';
import { logger } from '@/utils/logger';
import { recordGeneration } from '@/observability/metrics';
import type { VideoGenerationInput, VideoGenerationResult, VideoProvider } from '../provider.types';

interface ComfyOutputFile {
  filename: string;
  subfolder: string;
  type: string;
}

interface ComfyHistoryEntry {
  outputs: Record<string, Record<string, ComfyOutputFile[] | undefined>>;
  status?: { completed?: boolean; status_str?: string; messages?: unknown[] };
}

type ComfyWorkflow = Record<string, { inputs: Record<string, unknown>; class_type: string }>;

const VIDEO_OUTPUT_KEYS = ['gifs', 'videos', 'video', 'files'] as const;
const NEGATIVE_MARKER = '__NEGATIVE__';
const VIDEO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  webp: 'image/webp',
  gif: 'image/gif',
};

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
    throw new ServerError(`comfy video workflow not found: ${name}`);
  }
}

export function applyVideoInputs(
  workflow: ComfyWorkflow,
  input: VideoGenerationInput,
  seed: number,
  uploadedImage?: string
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
    if ('length' in inputs) {
      inputs.length = input.frames;
    }
    if ('num_frames' in inputs) {
      inputs.num_frames = input.frames;
    }
    if ('batch_size' in inputs && node.class_type.includes('Latent')) {
      inputs.batch_size = 1;
    }
    if ('steps' in inputs) {
      inputs.steps = input.steps ?? env.STUDIO_VIDEO_STEPS;
    }
    if ('cfg' in inputs) {
      inputs.cfg = input.cfgScale ?? env.STUDIO_VIDEO_CFG;
    }
    if ('fps' in inputs) {
      inputs.fps = input.fps;
    }
    if ('frame_rate' in inputs) {
      inputs.frame_rate = input.fps;
    }

    if (node.class_type === 'CLIPTextEncode' && typeof inputs.text === 'string') {
      inputs.text = inputs.text === NEGATIVE_MARKER ? (input.negativePrompt ?? '') : input.prompt;
    }

    if (uploadedImage && node.class_type === 'LoadImage' && 'image' in inputs) {
      inputs.image = uploadedImage;
    }
  }

  return workflow;
}

export class ComfyUiWanVideoProvider implements VideoProvider {
  readonly name = 'comfyui-wan';
  readonly model: string;
  readonly maxFrames: number;
  private readonly client: AxiosInstance;

  constructor(model = env.STUDIO_VIDEO_MODEL) {
    this.model = model;
    this.maxFrames = env.STUDIO_VIDEO_MAX_FRAMES;
    this.client = axios.create({
      baseURL: env.COMFYUI_BASE_URL,
      timeout: env.STUDIO_VIDEO_TIMEOUT_MS,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
  }

  async generate(input: VideoGenerationInput): Promise<VideoGenerationResult> {
    if (input.frames > this.maxFrames) {
      throw new BadRequestError(
        `requested ${input.frames} frames but ${this.model} is capped at ${this.maxFrames}`
      );
    }

    const startedAt = Date.now();
    const seed = input.seed ?? Math.floor(Math.random() * 2_147_483_647);
    const firstFrame = input.continuityFrame ?? input.referenceImage;
    const workflowName =
      input.workflow ?? (firstFrame ? env.STUDIO_WAN_I2V_WORKFLOW : env.STUDIO_WAN_T2V_WORKFLOW);

    const uploadedImage = firstFrame ? await this.uploadImage(firstFrame) : undefined;
    const workflow = applyVideoInputs(loadWorkflow(workflowName), input, seed, uploadedImage);

    const promptId = await this.queue(workflow);
    const entry = await this.waitForCompletion(promptId);
    const { body, extension } = await this.collectVideo(entry);

    const durationMs = Date.now() - startedAt;
    recordGeneration('video', this.name, durationMs);

    logger.info(
      { model: this.model, workflow: workflowName, seed, frames: input.frames, durationMs },
      'studio.video.generated'
    );

    return {
      video: body,
      mimeType: VIDEO_MIME[extension] ?? 'video/mp4',
      width: input.width,
      height: input.height,
      fps: input.fps,
      frames: input.frames,
      durationSeconds: Number((input.frames / input.fps).toFixed(3)),
      seed,
      usage: {
        provider: this.name,
        model: this.model,
        modelVersion: workflowName,
        seed,
        durationMs,
        costMicroUsd: 0n,
      },
    };
  }

  private async uploadImage(image: Buffer): Promise<string> {
    const filename = `studio_${randomUUID()}.png`;
    const form = new FormData();
    form.append('image', image, { filename, contentType: 'image/png' });
    form.append('overwrite', 'true');

    try {
      const response = await this.client.post<{ name: string; subfolder?: string }>(
        '/upload/image',
        form,
        {
          headers: form.getHeaders(),
        }
      );
      const subfolder = response.data.subfolder;
      return subfolder ? `${subfolder}/${response.data.name}` : response.data.name;
    } catch (err) {
      throw this.describe('uploading the reference frame', err);
    }
  }

  private async queue(workflow: ComfyWorkflow): Promise<string> {
    try {
      const response = await this.client.post<{
        prompt_id: string;
        node_errors?: Record<string, unknown>;
      }>('/prompt', { prompt: workflow, client_id: randomUUID() });

      const nodeErrors = response.data.node_errors;
      if (nodeErrors && Object.keys(nodeErrors).length > 0) {
        throw new BadRequestError(
          `comfy rejected the workflow: ${JSON.stringify(nodeErrors).slice(0, 400)}`
        );
      }

      return response.data.prompt_id;
    } catch (err) {
      throw this.describe('queueing the workflow', err);
    }
  }

  private async waitForCompletion(promptId: string): Promise<ComfyHistoryEntry> {
    const deadline = Date.now() + env.STUDIO_VIDEO_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const history = await this.client.get<Record<string, ComfyHistoryEntry>>(
        `/history/${promptId}`
      );
      const entry = history.data[promptId];

      if (entry) {
        if (entry.status?.status_str === 'error') {
          throw new BadRequestError(`comfy workflow failed for prompt ${promptId}`);
        }
        if (entry.outputs && Object.keys(entry.outputs).length > 0) {
          return entry;
        }
      }

      await new Promise(done => setTimeout(done, env.STUDIO_VIDEO_POLL_MS));
    }

    throw new ServerError(`comfy timed out generating prompt ${promptId}`);
  }

  private async collectVideo(
    entry: ComfyHistoryEntry
  ): Promise<{ body: Buffer; extension: string }> {
    for (const output of Object.values(entry.outputs)) {
      for (const key of VIDEO_OUTPUT_KEYS) {
        const files = output[key];
        if (!files || files.length === 0) {
          continue;
        }

        const file = files[files.length - 1];
        const response = await this.client.get<ArrayBuffer>('/view', {
          params: { filename: file.filename, subfolder: file.subfolder, type: file.type },
          responseType: 'arraybuffer',
        });

        return {
          body: Buffer.from(response.data),
          extension: file.filename.split('.').pop()?.toLowerCase() ?? 'mp4',
        };
      }
    }

    throw new ServerError('comfy finished without producing a video output');
  }

  private describe(operation: string, err: unknown): Error {
    if (err instanceof BadRequestError || err instanceof ServerError) {
      return err;
    }
    if (isAxiosError(err) && err.response) {
      const detail = JSON.stringify(err.response.data).slice(0, 400);
      if (err.response.status === 400) {
        return new BadRequestError(`comfy rejected ${operation}: ${detail}`);
      }
      logger.error({ operation, status: err.response.status, detail }, 'comfy video error');
      return new ServerError(`comfy error while ${operation}`);
    }
    return new ServerError(`comfy unreachable while ${operation}`);
  }

  async healthy(): Promise<boolean> {
    try {
      const response = await this.client.get('/system_stats', { timeout: 5000 });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}
