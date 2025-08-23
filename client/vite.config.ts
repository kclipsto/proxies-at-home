import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import flowbiteReact from "flowbite-react/plugin/vite";
import path from "path";
import { defineConfig } from "vite";

export default defineConfig({
  css: {
    postcss: path.resolve(__dirname, "../../postcss.config.js"),
  },
  server: { host: true, port: 5173 },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  plugins: [react(), tailwindcss(), flowbiteReact()],
});
