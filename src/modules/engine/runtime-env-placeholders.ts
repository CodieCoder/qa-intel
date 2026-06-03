/**
 * Resolves `{{ENV_VAR}}` placeholders in step values at **run** time (not compile time).
 * Keeps committed `suite.json` free of baked QA credentials — see
 * `substitute-qa-env.mjs` for compile-time pass-through of the same keys.
 */

import fs from "node:fs";
import path from "node:path";

const PLACEHOLDER_RE = /\{\{([A-Z][A-Z0-9_]*)\}\}/g;

function mergeEnvFromFile(target: Record<string, string>, filePath: string): void {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    let key = t.slice(0, eq).trim();
    if (key.startsWith("export ")) key = key.slice(7).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    target[key] = val;
  }
}

let mergedEnvCache: Record<string, string> | null = null;

/**
 * Merges `process.env` with repo `.env` cascade (same order as substitute-qa-env.mjs).
 */
export function getQaMergedEnv(): Record<string, string> {
  if (mergedEnvCache) return mergedEnvCache;

  const merged: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) merged[k] = v;
  }

  const repoRoot = process.env.REPO_ROOT;
  if (repoRoot) {
    mergeEnvFromFile(merged, path.join(repoRoot, ".env"));
    mergeEnvFromFile(merged, path.join(repoRoot, "apps", "admin", ".env.local"));
    mergeEnvFromFile(merged, path.join(repoRoot, "apps", "admin", ".env.qa.local"));
  }

  mergedEnvCache = merged;
  return merged;
}

/**
 * Replaces every `{{VAR}}` (A-Z, digits, underscore) with the merged env value.
 * Throws if any placeholder is missing or empty.
 */
export function resolveRuntimeEnvPlaceholders(input: string): string {
  const merged = getQaMergedEnv();
  return input.replace(PLACEHOLDER_RE, (match, key: string) => {
    const v = merged[key];
    if (v === undefined || v === "") {
      throw new Error(
        `Missing or empty env for placeholder {{${key}}}. Set ${key} in the environment or in apps/admin/.env.qa.local (REPO_ROOT must point at the repo root when running suite.json).`,
      );
    }
    return v;
  });
}
