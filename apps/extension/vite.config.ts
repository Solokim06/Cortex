import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { crx } from "@crxjs/vite-plugin";
import { resolve } from "path";
import chromeManifest from "./src/manifest.json" with { type: "json" };
import firefoxManifest from "./src/manifest.firefox.json" with { type: "json" };

const TARGET = process.env.TARGET === "firefox" ? "firefox" : "chrome";
const manifest = TARGET === "firefox" ? firefoxManifest : chromeManifest;

export default defineConfig({
  plugins: [
    react(),
    crx({ manifest: manifest as unknown as Parameters<typeof crx>[0]["manifest"] }),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    hmr: {
      port: 5174,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "src/popup/index.html"),
        options: resolve(__dirname, "src/options/index.html"),
        sidepanel: resolve(__dirname, "src/sidepanel/index.html"),
      },
    },
  },
});
