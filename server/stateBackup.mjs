// Copyright (c) 2026 Sary Ismail. All rights reserved.
// Licensed under the Business Source License 1.1 (BSL 1.1). See LICENSE file for details.

import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

function filesUnder(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Symbolic links are not supported in state backups: ${path}`);
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && entry.name !== "backup-manifest.json") out.push(path);
    }
  };
  walk(root);
  return out.sort();
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function manifestFor(root) {
  return filesUnder(root).map((path) => ({
    path: relative(root, path),
    bytes: lstatSync(path).size,
    sha256: sha256(path),
  }));
}

export function createStateBackup({ sourceDir, backupDir }) {
  const source = resolve(String(sourceDir || ""));
  const destination = resolve(String(backupDir || ""));
  if (!sourceDir || !backupDir) throw new Error("sourceDir and backupDir are required");
  if (!existsSync(source)) throw new Error(`Persistence directory does not exist: ${source}`);
  if (existsSync(destination) && readdirSync(destination).length > 0) throw new Error(`Backup destination must be empty: ${destination}`);
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true, errorOnExist: true, force: false });
  const manifest = {
    schema_version: "aria.state-backup.v1",
    created_at: new Date().toISOString(),
    source_name: basename(source),
    files: manifestFor(destination),
  };
  writeFileSync(join(destination, "backup-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return manifest;
}

export function verifyStateBackup(backupDir) {
  const root = resolve(String(backupDir || ""));
  try {
    const manifest = JSON.parse(readFileSync(join(root, "backup-manifest.json"), "utf8"));
    const actual = manifestFor(root);
    const expected = Array.isArray(manifest.files) ? manifest.files : [];
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    return { ok, expected_files: expected.length, actual_files: actual.length, manifest };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

export function restoreStateBackup({ backupDir, targetDir }) {
  const source = resolve(String(backupDir || ""));
  const destination = resolve(String(targetDir || ""));
  if (!backupDir || !targetDir) throw new Error("backupDir and targetDir are required");
  const verification = verifyStateBackup(source);
  if (!verification.ok) throw new Error(`Backup verification failed: ${verification.error || "digest mismatch"}`);
  if (existsSync(destination) && readdirSync(destination).length > 0) throw new Error(`Restore target must be empty: ${destination}`);
  mkdirSync(destination, { recursive: true });
  for (const file of verification.manifest.files) {
    const sourcePath = join(source, file.path);
    const targetPath = join(destination, file.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    cpSync(sourcePath, targetPath, { errorOnExist: true, force: false });
  }
  return { restored_files: verification.manifest.files.length, target: destination };
}
