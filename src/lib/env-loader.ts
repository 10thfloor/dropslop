/**
 * Minimal .env loader for local development.
 *
 * Why this exists:
 * - This repo uses `tsx` (no dotenv by default)
 * - `.env` is gitignored, but we still want a "drop-in" local dev experience
 *
 * Behavior:
 * - Loads from `ENV_FILE` (if set) else `./.env` (process.cwd())
 * - Does NOT override already-set environment variables
 * - No-op in production
 */

import fs from "node:fs";
import path from "node:path";

function unquote(value: string): string {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1);
  }
  return v;
}

function parseDotEnv(contents: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = contents.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const idx = line.indexOf("=");
    if (idx <= 0) continue;

    const key = line.slice(0, idx).trim();
    const rest = line.slice(idx + 1);

    // Support inline comments only when value is not quoted:
    // FOO=bar # comment  -> "bar"
    // FOO="bar # baz"    -> "bar # baz"
    let value = rest;
    const trimmed = rest.trim();
    const isQuoted = trimmed.startsWith('"') || trimmed.startsWith("'");
    if (!isQuoted) {
      const hash = rest.indexOf("#");
      if (hash >= 0) value = rest.slice(0, hash);
    }

    out[key] = unquote(value);
  }

  return out;
}

function loadEnvFileIfPresent(): void {
  if (process.env.NODE_ENV === "production") return;

  const envFile = process.env.ENV_FILE || path.join(process.cwd(), ".env");
  if (!fs.existsSync(envFile)) return;

  try {
    const contents = fs.readFileSync(envFile, "utf8");
    const parsed = parseDotEnv(contents);
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] === undefined) process.env[k] = v;
    }
  } catch {
    // Intentionally silent: local convenience only.
  }
}

loadEnvFileIfPresent();


