// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import process from 'node:process'

const ariaApiPort = process.env.ARIA_PORT || "5000";
const ariaApiTarget = `http://127.0.0.1:${ariaApiPort}`;

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three-vendor";
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) return "react-vendor";
          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      "/api": { target: ariaApiTarget, ws: true },
    },
  },
})
