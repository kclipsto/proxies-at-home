/// <reference types="vitest" />

import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import flowbiteReact from "flowbite-react/plugin/vite";
import path from "path";
import { defineConfig } from "vitest/config";


import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
    VitePWA({
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
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ui': ['flowbite-react', 'lucide-react', 'swiper', '@use-gesture/react'],
          'vendor-db': ['dexie', 'dexie-react-hooks'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/modifiers', '@dnd-kit/sortable'],
          pdf: ['pdf-lib'],
        },
      },
    },
  },
});
