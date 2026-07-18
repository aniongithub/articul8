import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

// Static SPA, no server. Runtime/core resolved via workspace symlinks (their
// built dist). Port 5173 is forwarded by the devcontainer.
export default defineConfig({
  plugins: [preact()],
  server: { host: true, port: 5173 },
  build: { target: "es2022", outDir: "dist" },
});