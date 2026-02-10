import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        reporters: ['default', 'hanging-process'],
        globalSetup: './vitest.globalSetup.ts',
        teardownTimeout: 1000,
        projects: [
            'client',
            'server',
            'scripts',
        ],
    },
});
