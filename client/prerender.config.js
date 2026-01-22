export default {
  routes: ["/"],
  outDir: "static-pages",
  serveDir: "dist",
  viewport: { width: 1200, height: 800 },
  // Remove dynamically injected modulepreload links with localhost URLs
  // These are injected by Vite at runtime and point to the local preview server
  skipPrerenderSelector: 'link[href^="http://localhost"], script[src^="http://localhost"]',
};
