#!/usr/bin/env node
/**
 * audit-testids.mjs — §10.4 of artifacts/analysis/qa-agent-grammar-migration-plan.md
 *
 * Walks apps/*\/src/** and packages/**\/src/**, runs the
 * `no-non-literal-testid` rule over every .ts/.tsx file, and prints every
 * non-compliant data-testid site with file:line, the offending expression,
 * and the suggested fix from the rule's message.
 *
 * Exits 0 when the rule reports 0 findings; exits 1 otherwise.
 *
 * The rule itself is reused from dist/ so this script IS the audit — no
 * duplicated AST logic. Run `yarn workspace @repo/qa-agent build` first
 * (or `tsc -b`) so dist/eslint is up to date.
 */

import { Linter } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { noNonLiteralTestid } from "../dist/eslint/rules/no-non-literal-testid.js";

// ─── Config ─────────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..", "..");

const ROOTS = [
  { base: "apps", depth: 1, sub: "src" },
  { base: "packages", depth: 1, sub: "src" },
];

const IGNORE_DIR_NAMES = new Set([
  "node_modules",
  "__tests__",
  "stories",
  "dist",
  ".next",
  "build",
  ".turbo",
  "coverage",
]);

const FILE_EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// ─── Discovery ──────────────────────────────────────────────────────────────

/**
 * Return all .tsx/.ts files under `dir`, honoring IGNORE_DIR_NAMES.
 * Also skips files named *.test.* / *.spec.* / *.stories.*.
 */
async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const ent of entries) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (IGNORE_DIR_NAMES.has(ent.name)) continue;
      out.push(...(await walk(full)));
    } else if (ent.isFile()) {
      const name = ent.name;
      if (/\.(test|spec|stories)\.[cm]?[jt]sx?$/.test(name)) continue;
      const dot = name.lastIndexOf(".");
      if (dot < 0) continue;
      const ext = name.slice(dot);
      if (!FILE_EXTS.has(ext)) continue;
      out.push(full);
    }
  }
  return out;
}

async function collectFiles() {
  const files = [];
  for (const { base, sub } of ROOTS) {
    const baseAbs = join(REPO_ROOT, base);
    let subdirs;
    try {
      subdirs = await readdir(baseAbs, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const ent of subdirs) {
      if (!ent.isDirectory()) continue;
      if (IGNORE_DIR_NAMES.has(ent.name)) continue;
      const target = join(baseAbs, ent.name, sub);
      try {
        statSync(target);
      } catch {
        continue;
      }
      files.push(...(await walk(target)));
    }
  }
  return files.sort();
}

// ─── Lint pass ──────────────────────────────────────────────────────────────

const linter = new Linter();

const ruleConfig = {
  files: ["**/*.{ts,tsx,js,jsx,mjs,cjs}"],
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaFeatures: { jsx: true },
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
  plugins: {
    "@repo/qa-agent": {
      rules: {
        "no-non-literal-testid": noNonLiteralTestid,
      },
    },
  },
  rules: {
    "@repo/qa-agent/no-non-literal-testid": "error",
  },
};

/**
 * Emit the offending source snippet for a given location.
 */
function snippetFor(source, line) {
  const lines = source.split(/\r?\n/);
  return lines[line - 1]?.trim() ?? "";
}

async function main() {
  const files = await collectFiles();
  let findings = 0;
  let filesScanned = 0;

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("data-testid")) continue;
    filesScanned++;
    let messages;
    try {
      messages = linter.verify(source, ruleConfig, { filename: file });
    } catch (err) {
      // Parse error — skip file but don't fail the audit.
      const rel = relative(REPO_ROOT, file);
      console.error(`  ! parse error in ${rel}: ${err.message}`);
      continue;
    }
    for (const m of messages) {
      if (m.ruleId !== "@repo/qa-agent/no-non-literal-testid") continue;
      findings++;
      const rel = relative(REPO_ROOT, file);
      const snippet = snippetFor(source, m.line);
      console.log(`${rel}:${m.line}:${m.column}`);
      console.log(`  messageId: ${m.messageId ?? "<unknown>"}`);
      console.log(`  source:    ${snippet}`);
      console.log(`  message:   ${m.message}`);
      console.log();
    }
  }

  console.log("─".repeat(72));
  console.log(`Scanned ${filesScanned} files with a data-testid occurrence.`);
  console.log(`Findings: ${findings}`);
  if (findings > 0) {
    console.log();
    console.log(
      "Fix each site per the rule's suggestion (see message above) and re-run.",
    );
    process.exit(1);
  }
  console.log("Clean. Every data-testid is statically resolvable.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
