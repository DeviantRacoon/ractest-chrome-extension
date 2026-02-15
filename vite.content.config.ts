import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    chunkSizeWarningLimit: 1000,
    emptyOutDir: false, // Don't empty dist, as it contains the popup build
    outDir: "dist",
    rollupOptions: {
      input: resolve(__dirname, "src/entrypoints/content/index.ts"),
      output: {
        entryFileNames: "content/content.js",
        format: "iife",
        name: "RacTestContentScript",
        inlineDynamicImports: true,
      },
      // Ensure we don't treat any imports as external (bundle everything)
      external: [],
    },
  },
  define: {
    "process.env.NODE_ENV": JSON.stringify(
      process.env.NODE_ENV || "production",
    ),
  },
});
