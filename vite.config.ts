import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler"]],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "index.html"),
        background: resolve(__dirname, "src/entrypoints/background/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          return chunkInfo.name === "background"
            ? "service-worker.js"
            : "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/react-router")
          ) {
            return "vendor-react";
          }
          if (
            id.includes("/@dnd-kit/") ||
            id.includes("/@faker-js/") ||
            id.includes("/react-markdown/")
          ) {
            return "vendor-features";
          }
          if (id.includes("/lucide-react/")) {
            return "vendor-icons";
          }
          return "vendor-misc";
        },
      },
    },
  },
});
