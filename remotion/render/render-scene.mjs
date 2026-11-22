import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function argOf(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1 || index === process.argv.length - 1) {
    if (fallback === undefined) {
      throw new Error(`missing required --${name}`);
    }
    return fallback;
  }
  return process.argv[index + 1];
}

const jobPath = resolve(argOf('job'));
const outputPath = resolve(argOf('output'));
const publicDir = resolve(argOf('assets', resolve(here, '..', 'public')));
const concurrency = Number(argOf('concurrency', '2'));

const job = JSON.parse(readFileSync(jobPath, 'utf8'));
const inputProps = job.props ?? job;

const serveUrl = await bundle({
  entryPoint: resolve(here, '..', 'src', 'index.ts'),
  publicDir,
  onProgress: () => undefined,
});

const composition = await selectComposition({
  serveUrl,
  id: job.composition ?? 'Scene',
  inputProps,
});

await renderMedia({
  composition,
  serveUrl,
  codec: 'h264',
  crf: Number(job.crf ?? 18),
  outputLocation: outputPath,
  inputProps,
  concurrency,
  chromiumOptions: { gl: 'angle' },
  onProgress: () => undefined,
});

const body = readFileSync(outputPath);
process.stdout.write(
  JSON.stringify({
    job_id: job.job_id ?? inputProps.scene_id,
    output_key: job.output_key ?? '',
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    duration_seconds: composition.durationInFrames / composition.fps,
    frames_rendered: composition.durationInFrames,
    bytes: statSync(outputPath).size,
    checksum: createHash('sha256').update(body).digest('hex'),
    has_audio: Boolean(inputProps.audio_src),
    engine_version: 'remotion-4',
  })
);
