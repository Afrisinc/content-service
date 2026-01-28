"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var config_1 = require("vitest/config");
var path_1 = require("path");
exports.default = (0, config_1.defineConfig)({
    esbuild: {
        target: 'node20',
    },
    test: {
        globals: true,
        environment: 'node',
        setupFiles: ['./src/tests/setup.ts'],
        typecheck: {
            enabled: false,
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html'],
            exclude: [
                'node_modules/',
                'src/tests/',
                'dist/',
                '**/*.d.ts',
                'vitest.config.ts',
                'src/database/seed.ts',
                'src/config/',
                'src/schemas/',
            ],
            reportsDirectory: './coverage',
            all: true,
        },
        testTimeout: 10000,
        hookTimeout: 10000,
    },
    resolve: {
        alias: {
            '@': path_1.default.resolve(__dirname, './src'),
            '@/controllers': path_1.default.resolve(__dirname, './src/controllers'),
            '@/services': path_1.default.resolve(__dirname, './src/services'),
            '@/repositories': path_1.default.resolve(__dirname, './src/repositories'),
            '@/middlewares': path_1.default.resolve(__dirname, './src/middlewares'),
            '@/routes': path_1.default.resolve(__dirname, './src/routes'),
            '@/utils': path_1.default.resolve(__dirname, './src/utils'),
            '@/schemas': path_1.default.resolve(__dirname, './src/schemas'),
            '@/database': path_1.default.resolve(__dirname, './src/database'),
            '@/tests': path_1.default.resolve(__dirname, './src/tests'),
        },
    },
});
