// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { defineConfig, loadEnv } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig(({ mode }) => {
  // Load .env so renderer can access VITE_* variables in both dev and build
  const env = loadEnv(mode, process.cwd(), "");

  return {
    main: {
      build: {
        lib: {
          entry: resolve("electron/main.js"),
        },
      },
    },
    preload: {
      build: {
        lib: {
          entry: resolve("electron/preload.js"),
        },
      },
    },
    renderer: {
      root: ".",
      plugins: [react()],
      define: {
        // Bake env values into the renderer bundle so they survive packaging.
        // In dev mode an explicitly-empty VITE_ARIA_API_BASE lets the Vite proxy
        // handle /api/* as relative paths. In a production (packaged) build we must
        // hard-code the local Aria server address because there is no proxy and
        // relative fetches break when the renderer loads from app:// or file://.
        "import.meta.env.VITE_ARIA_API_BASE": JSON.stringify(
          mode !== "production" && "VITE_ARIA_API_BASE" in env && env.VITE_ARIA_API_BASE !== undefined
            ? env.VITE_ARIA_API_BASE          // "" in desktop dev → uses proxy
            : "http://localhost:5000"          // packaged build / plain `vite` dev
        ),
        "import.meta.env.VITE_ARIA_DEBUG":       JSON.stringify(env.VITE_ARIA_DEBUG      || ""),
      },
      server: {
        proxy: {
          "/api": { target: "http://localhost:5000", ws: true },
        },
      },
      build: {
        outDir: "out/renderer",
        rollupOptions: {
          input: resolve("index.html"),
        },
      },
    },
  };
});
