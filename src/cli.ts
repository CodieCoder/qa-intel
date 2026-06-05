#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { compileGherkin } from "./modules/dsl/index.js";
import { runSuiteTool } from "./modules/engine/index.js";

// ─── CLI Entry Point ─────────────────────────────────────────────────────────
//
// All output is JSON. No ANSI. Designed for agent-to-agent consumption.
//
// Commands:
//   qa-runner run <suite.json> [flags]                  Execute tests → JSON
//   qa-runner compile <feature> [flags]                 Gherkin → suite.json
//

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === "compile") return compileFeature(args);

  // If first arg is a .feature file, compile and run in one step
  if (args[0] && args[0].endsWith(".feature")) return compileAndRun(args);

  // Default: run suite from JSON files
  if (args[0] === "run") return runSuite(args.slice(1));
  return runSuite(args);
}

// ─── Compile: Gherkin → suite.json ──────────────────────────────────────────

async function compileFeature(args: string[]) {
  const featurePath = args[1];
  if (!featurePath) {
    outputError(
      "Usage: qa-runner compile <feature-file> [--name <name>] [--base-url <url>] [--out-dir <dir>]",
    );
    process.exit(1);
  }
  rejectUnexpectedPositional(args, 2);

  const resolvedPath = resolve(featurePath);
  const gherkinSource = await readFile(resolvedPath, "utf-8");

  const suiteName =
    getFlagValue(args, "--name") ??
    basename(featurePath, extname(featurePath)).replace(/[_-]/g, " ");
  const baseUrl = getFlagValue(args, "--base-url") ?? baseUrlFromEnv();
  // Default out-dir: `.qa-results/compile/` under the monorepo root.
  // `.qa-results/` is gitignored — compile artifacts are transient and
  // should never be committed. Users can still pass `--out-dir` explicitly
  // (including `--out-dir .`) when they need the files elsewhere.
  const outDir =
    getFlagValue(args, "--out-dir") ??
    resolve(findRepoRoot(), ".qa-results/compile");

  const { contracts, errors, warnings } = compileGherkin(gherkinSource, {
    sourceFile: resolvedPath,
  });

  if (contracts.length === 0 || errors.length > 0) {
    outputJSON({
      ok: false,
      error:
        contracts.length === 0
          ? "No valid contracts compiled"
          : "Compile errors detected",
      compileErrors: errors,
      compileWarnings: warnings.length > 0 ? warnings : undefined,
    });
    process.exit(1);
  }

  // Build suite.json
  const suite = { name: suiteName, baseUrl, contracts };

  // Write files
  const suitePath = resolve(outDir, "suite.json");

  await mkdir(resolve(outDir), { recursive: true });
  await writeFile(suitePath, JSON.stringify(suite, null, 2) + "\n", "utf-8");

  outputJSON({
    ok: true,
    suite: suitePath,
    stats: {
      contracts: contracts.length,
      errors: errors.length,
      warnings: warnings.length,
    },
    compileErrors: errors.length > 0 ? errors : undefined,
    compileWarnings: warnings.length > 0 ? warnings : undefined,
  });
}

// ─── Compile + Run ───────────────────────────────────────────────────────────

async function compileAndRun(args: string[]) {
  const featurePath = resolve(args[0]);
  if (!args[0]) {
    outputError("Usage: qa-runner <feature-file> [flags]");
    process.exit(1);
  }
  rejectUnexpectedPositional(args, 1);

  const gherkinSource = await readFile(featurePath, "utf-8");
  const { contracts, errors } = compileGherkin(gherkinSource, {
    sourceFile: featurePath,
  });

  if (contracts.length === 0 || errors.length > 0) {
    outputJSON({
      ok: false,
      error:
        contracts.length === 0
          ? "No valid contracts compiled"
          : "Compile errors detected",
      compileErrors: errors,
    });
    process.exit(1);
  }

  const suiteName = basename(featurePath, extname(featurePath)).replace(
    /[_-]/g,
    " ",
  );
  const baseUrl = getFlagValue(args, "--base-url") ?? baseUrlFromEnv();

  const suite = { name: suiteName, baseUrl, contracts };

  await executeSuite(suite, args);
}

// ─── Run Suite ───────────────────────────────────────────────────────────────

async function runSuite(args: string[]) {
  if (args.length < 1 || args[0]?.startsWith("--")) {
    outputError(
      "Usage: qa-runner <suite.json> [--base-url <url>] [--headed] [--fail-fast]",
    );
    process.exit(1);
  }
  rejectUnexpectedPositional(args, 1);

  const suitePath = resolve(args[0]);

  try {
    const suiteRaw = JSON.parse(await readFile(suitePath, "utf-8"));

    await executeSuite(suiteRaw, args);
  } catch (err) {
    outputJSON({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(2);
  }
}

// ─── Execute Suite (shared by run and compile+run) ───────────────────────────

async function executeSuite(suiteRaw: any, args: string[]) {
  const baseUrl = getFlagValue(args, "--base-url");
  const failFast = args.includes("--fail-fast");
  const autoHeal = args.includes("--auto-heal");
  const artifactDir =
    getFlagValue(args, "--artifact-dir") ?? ".qa-results/artifacts";
  const resultsDb =
    getFlagValue(args, "--results-db") ?? ".qa-results/results.db";

  try {
    const result = await runSuiteTool({
      suite: suiteRaw,
      baseUrl: baseUrl ?? suiteRaw.baseUrl ?? baseUrlFromEnv(),
      artifactDir,
      resultsDb,
      config: {
        headless: !args.includes("--headed"),
        failFast,
        autoHeal,
      },
    });

    outputJSON(result);

    if (result.ok && result.data) {
      process.exit(result.data.status === "passed" ? 0 : 1);
    } else {
      process.exit(2);
    }
  } catch (err) {
    outputJSON({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    });
    process.exit(2);
  }
}

// ─── Output Helpers ──────────────────────────────────────────────────────────

function outputJSON(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

function outputError(message: string): void {
  outputJSON({ ok: false, error: message });
}

// ─── Flag Helpers ────────────────────────────────────────────────────────────

/** Derive base URL from PORT env var (single source of truth: .env). */
function baseUrlFromEnv(): string {
  const port = process.env.PORT ?? "3002";
  return `http://localhost:${port}`;
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return undefined;
}

const VALUE_FLAGS = new Set([
  "--name",
  "--base-url",
  "--out-dir",
  "--artifact-dir",
  "--results-db",
]);

function rejectUnexpectedPositional(args: string[], startIndex: number): void {
  for (let i = startIndex; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg)) i++;
      continue;
    }

    outputError(
      `Unexpected positional argument "${arg}". contracts.json is no longer used; run compiled suites with "qa-runner run <suite.json>".`,
    );
    process.exit(1);
  }
}

function findRepoRoot(): string {
  let dir = process.cwd();
  const { root } = parsePath(dir);
  while (dir !== root) {
    // Heuristic: the monorepo root contains an `apps/` dir and a
    // top-level `package.json`. Both checks avoid picking a random
    // ancestor that happens to have one or the other.
    if (
      existsSync(resolve(dir, "apps")) &&
      existsSync(resolve(dir, "package.json"))
    ) {
      return dir;
    }
    dir = resolve(dir, "..");
  }
  return process.cwd();
}

// Tiny wrapper to avoid an import-level dependency on node:path/posix parse.
// (node:path is already imported; this keeps a clear call-site.)
function parsePath(p: string): { root: string } {
  // On POSIX the root is "/"; on Windows it's "C:\\" etc. `resolve("..")`
  // from the root returns the same root, so that's what we compare against.
  return { root: resolve(p, "/") };
}

main();
