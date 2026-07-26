# Aria Enterprise Function Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Aria so monitoring and commands use a local Gemini-backed function server, while the frontend presents an enterprise-grade operations console.

**Architecture:** A local Node HTTP server owns the Gemini API key, exposes `/api/live`, `/api/aria/suggestions`, and `/api/aria/command`, and executes declared Aria functions against local monitoring data. The React frontend calls this local server through a small client layer and no longer sends Gemini text requests directly from the browser for monitoring/actions.

**Tech Stack:** React, Vite, Three.js, Node HTTP server, Gemini REST `generateContent` function calling.

---

### Task 1: Add Aria Function Server

**Files:**
- Create: `server/index.mjs`
- Create: `server/ariaData.mjs`
- Create: `test/server/aria-server-source.test.mjs`

- [x] Write tests that assert the server declares Gemini function tools and exposes local Aria endpoints.
- [x] Implement local security data and function handlers.
- [x] Implement Gemini function-call round trip with fallback deterministic results.

### Task 2: Reconnect Frontend To Local Aria API

**Files:**
- Modify: `src/App.jsx`
- Modify: `test/live-aria-source.test.mjs`

- [x] Remove browser-side Gemini REST monitoring/action code.
- [x] Add `ARIA_API_BASE` and route monitoring/actions/suggestions to the local server.
- [x] Keep Live Aria realtime voice separate.

### Task 3: Enterprise UI Cleanup

**Files:**
- Modify: `src/App.jsx`

- [x] Replace flashy command panel copy with operational console language.
- [x] Tighten card surfaces, headers, and destination metadata.
- [x] Ensure command outcomes show tool execution details, status, and feed entries.

### Task 4: Scripts And Verification

**Files:**
- Modify: `package.json`

- [x] Add `server` and `test:server` scripts.
- [x] Run `node --test test/server/aria-server-source.test.mjs`.
- [x] Run existing Live Aria source tests.
- [x] Run lint and build.
