/// <reference types="vitest" />

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import flowbiteReact from "flowbite-react/plugin/vite";
import path from "path";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Use relative paths for Electron (file:// protocol)
  base: './',
  css: {
    postcss: path.resolve(__dirname, "../../postcss.config.js"),
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:3001",
        changeOrigin: true,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    flowbiteReact(),
    !process.env.VITEST && VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "mask-icon.svg"],
      manifest: {
        name: "Proxxied",
        short_name: "Proxxied",
        description: "Build your proxies",
        theme_color: "#ffffff",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        // Built-in cardback images are 2-3MB each; allow them to be precached
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
      },
    }),
  ],
  test: {
    name: 'client',
    globals: true,
    pool: 'threads',
    environment: 'jsdom',
    setupFiles: [path.resolve(__dirname, './src/vitest.setup.ts')],
    globalSetup: path.resolve(__dirname, './src/test/globalSetup.ts'),
    teardownTimeout: 1000,
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
    // Increase timeout to prevent flaky failures during coverage runs
    testTimeout: 120000,
    hookTimeout: 120000,
    // Retry flaky tests once before marking as failed
    retry: 5,
    reporters: ['default', 'hanging-process'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/vitest.setup.ts',
        '**/vite-env.d.ts',
        '**/main.tsx',
        '**/*.worker.ts', // Workers are hard to test
      ],
      reportsDirectory: './coverage',
      skipFull: true,
      thresholds: {
        lines: 80,
        branches: 80,
        functions: 80,
        statements: 80,
      },
      reportOnFailure: true,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['flowbite-react', 'lucide-react', 'swiper', '@use-gesture/react'],
          'vendor-db': ['dexie', 'dexie-react-hooks'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/modifiers', '@dnd-kit/sortable'],
          'vendor-pixi': ['pixi.js'],
          pdf: ['pdf-lib'],
        },
      },
    },
    // vendor-pixi is ~502KB which can't be split further
    chunkSizeWarningLimit: 550,
  },
});
