import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  esbuild: { target: 'node20' },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/tests/studio/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'src/studio/contracts/**',
        'src/studio/pipeline/**',
        'src/studio/engines/render-profiles.ts',
        'src/studio/directors/structured.ts',
        'src/queues/errors.ts',
        'src/queues/topology.ts',
        'src/queues/message.ts',
        'src/storage/keys.ts',
      ],
      reportsDirectory: './coverage-studio',
    },
    testTimeout: 10000,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
