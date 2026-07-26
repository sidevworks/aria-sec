// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

/**
 * PostgreSQL connection pool — the source of truth for governance state
 * (trust scores, decisions, evidence, audit events, approvals, scan records)
 * in a standalone multi-instance deployment. Flat JSON files cannot give
 * multiple server instances/operators atomic, concurrent-safe writes; a
 * connection pool over Postgres can.
 *
 * Local/dev fallback: when ARIA_DATABASE_URL is unset, isDbConfigured()
 * returns false and callers in ariaTrust.mjs / ariaOrchestrator.mjs /
 * auditLog.mjs fall back to their pre-existing flat-file behavior — so
 * `npm run server` still works with zero setup for local development.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, "migrations");

let _pool = null;
let _pgModule = null;

export function isDbConfigured() {
  return !!process.env.ARIA_DATABASE_URL;
}

async function loadPg() {
  if (!_pgModule) {
    _pgModule = await import("pg");
  }
  return _pgModule;
}

export async function getPool() {
  if (!isDbConfigured()) {
    throw new Error("ARIA_DATABASE_URL is not configured.");
  }
  if (_pool) return _pool;
  const { default: pg } = await loadPg();
  _pool = new pg.Pool({
    connectionString: process.env.ARIA_DATABASE_URL,
    ssl: process.env.ARIA_DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
    max: Number(process.env.ARIA_DATABASE_POOL_MAX || 10),
  });
  _pool.on("error", (err) => {
    process.stderr.write(`[db] idle pool client error: ${err.message}\n`);
  });
  return _pool;
}

export async function query(text, params) {
  const pool = await getPool();
  return pool.query(text, params);
}

// Runs `fn(client)` inside a single transaction — used wherever a governance
// write and its audit entry must succeed or fail together (e.g. promoting a
// capability and recording the promotion event).
export async function withTransaction(fn) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

export async function runMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const pool = await getPool();
  await pool.query(`CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM _migrations WHERE name = $1", [file]);
    if (rows.length) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    await pool.query(sql);
    await pool.query("INSERT INTO _migrations (name) VALUES ($1)", [file]);
    process.stdout.write(JSON.stringify({ level: "info", msg: "applied migration", file }) + "\n");
  }
}

export async function closePool() {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
