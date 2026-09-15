import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'studio_' });

export const jobsTotal = new Counter({
  name: 'studio_jobs_total',
  help: 'Studio jobs consumed, by queue and outcome',
  labelNames: ['queue', 'outcome'],
  registers: [registry],
});

export const jobDuration = new Histogram({
  name: 'studio_job_duration_seconds',
  help: 'Studio job handler duration',
  labelNames: ['queue', 'outcome'],
  buckets: [0.5, 2, 10, 30, 60, 180, 600, 1800, 3600],
  registers: [registry],
});

export const renderDuration = new Histogram({
  name: 'studio_render_duration_seconds',
  help: 'Scene render duration by engine and profile',
  labelNames: ['engine', 'profile'],
  buckets: [5, 30, 60, 180, 600, 1800, 3600, 7200],
  registers: [registry],
});

export const queueDepth = new Gauge({
  name: 'studio_render_queue_depth',
  help: 'Pending jobs per studio queue',
  labelNames: ['queue'],
  registers: [registry],
});

export const gpuMemoryUsed = new Gauge({
  name: 'studio_gpu_memory_used_bytes',
  help: 'GPU memory reported by the worker fleet',
  labelNames: ['worker'],
  registers: [registry],
});

export const gpuUtilisation = new Gauge({
  name: 'studio_gpu_utilisation_ratio',
  help: 'GPU utilisation reported by the worker fleet',
  labelNames: ['worker'],
  registers: [registry],
});

export const generationDuration = new Histogram({
  name: 'studio_generation_duration_seconds',
  help: 'Model generation duration by stage and provider',
  labelNames: ['stage', 'provider'],
  buckets: [1, 5, 15, 60, 180, 600],
  registers: [registry],
});

export const publishTotal = new Counter({
  name: 'studio_publish_total',
  help: 'Publishing attempts by platform and outcome',
  labelNames: ['platform', 'outcome'],
  registers: [registry],
});

export function recordJobResult(queue: string, outcome: string, durationMs: number): void {
  jobsTotal.inc({ queue, outcome });
  jobDuration.observe({ queue, outcome }, durationMs / 1000);
}

export function recordRender(engine: string, profile: string, durationMs: number): void {
  renderDuration.observe({ engine, profile }, durationMs / 1000);
}

export function recordGeneration(stage: string, provider: string, durationMs: number): void {
  generationDuration.observe({ stage, provider }, durationMs / 1000);
}

export function recordPublish(platform: string, outcome: string): void {
  publishTotal.inc({ platform, outcome });
}

export async function metricsSnapshot(): Promise<string> {
  return registry.metrics();
}
