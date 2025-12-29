/// <reference types="vitest" />

import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.test.ts'],
        exclude: ['node_modules', 'dist'],
        testTimeout: 60000,
        retry: 5,
        coverage: {
            reportOnFailure: true,
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**/*.ts'],
            exclude: ['**/*.test.ts'],
            reportsDirectory: './coverage',
        },
    },
});
