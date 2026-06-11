#!/usr/bin/env node
/**
 * generate-element-kinds-doc.mjs
 *
 * Regenerates the Element-Kind Vocabulary section of `docs/gherkin.md` from
 * the canonical TypeScript module at `src/modules/dsl/element-kinds.ts`.
 *
 * The module is the single source of truth. The markdown section between
 *   <!-- BEGIN: element-kinds ... -->
 *   <!-- END: element-kinds -->
 * is overwritten with seven category tables rendered from `ELEMENT_KINDS`.
 *
 * Usage:
 *   node scripts/generate-element-kinds-doc.mjs <path-to-md> [--check]
 *
 * Flags:
 *   --check    Do not write. Exit 0 if the file already matches, 1 if it
 *              would be changed. Useful for CI parity checks.
 *
 * Exit codes:
 *   0  success (file written or already up-to-date with --check)
 *   1  drift detected (with --check) or file malformed
 *   2  unexpected error
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BEGIN_MARKER =
  "<!-- BEGIN: element-kinds (auto-generated from src/modules/dsl/element-kinds.ts) -->";
const END_MARKER = "<!-- END: element-kinds -->";

const CATEGORY_LABELS = {
  layout: "Layout",
  navigation: "Navigation",
  forms: "Forms",
  actions: "Actions",
  data: "Data",
  feedback: "Feedback",
  media: "Media",
};

function usage() {
  console.error(
    "Usage: node scripts/generate-element-kinds-doc.mjs <path-to-md> [--check]",
  );
}

async function loadModule() {
  // Prefer the built module at dist/modules/dsl/element-kinds.js.
  const distPath = resolve(
    __dirname,
    "..",
    "dist",
    "modules",
    "dsl",
    "element-kinds.js",
  );
  if (!existsSync(distPath)) {
    console.error(
      `ERROR: Cannot find built module at ${distPath}.\n` +
        "Run `npm run build` first.",
    );
    process.exit(2);
  }
  return import(pathToFileURL(distPath).href);
}

/**
 * Render a GFM table with the same column-padding convention used by
 * prettier elsewhere in the reference doc. Column width for each column is
 * `max(header_length, max(cell_length), 3)` and content is left-padded with
 * spaces to that width. The separator row uses that many dashes.
 */
function renderTable(headers, rows) {
  const widths = headers.map((h, i) =>
    Math.max(
      h.length,
      ...rows.map((r) => r[i].length),
      3, // GFM minimum
    ),
  );
  const line = (cells) =>
    "| " + cells.map((c, i) => c.padEnd(widths[i])).join(" | ") + " |";
  const sep = "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |";
  return [line(headers), sep, ...rows.map((r) => line(r))].join("\n");
}

function renderVocabulary(kindsByCategory, categories) {
  const parts = [BEGIN_MARKER, ""];
  categories.forEach((cat, idx) => {
    const label = CATEGORY_LABELS[cat];
    if (!label) {
      throw new Error(`Unknown category: ${cat}`);
    }
    parts.push(`### ${label}`);
    parts.push("");
    const rows = kindsByCategory[cat].map((def) => [
      `\`${def.kind}\``,
      def.description,
    ]);
    parts.push(renderTable(["Kind", "Description"], rows));
    parts.push("");
    // No trailing blank line at the end — the END marker follows directly.
    if (idx === categories.length - 1) {
      // drop the final trailing blank line
      parts.pop();
    }
  });
  parts.push("");
  parts.push(END_MARKER);
  return parts.join("\n");
}

function splice(original, block) {
  const beginIdx = original.indexOf(BEGIN_MARKER);
  const endIdx = original.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1) {
    throw new Error(
      `Markers not found in file. Expected both:\n  ${BEGIN_MARKER}\n  ${END_MARKER}`,
    );
  }
  if (endIdx < beginIdx) {
    throw new Error(
      "END marker appears before BEGIN marker — file is malformed.",
    );
  }
  const endOfEndMarkerLine = endIdx + END_MARKER.length;
  return (
    original.slice(0, beginIdx) + block + original.slice(endOfEndMarkerLine)
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    usage();
    process.exit(2);
  }
  const checkMode = args.includes("--check");
  const targetPath = args.find((a) => !a.startsWith("--"));
  if (!targetPath) {
    usage();
    process.exit(2);
  }
  const resolved = resolve(process.cwd(), targetPath);
  if (!existsSync(resolved)) {
    console.error(`ERROR: Target file not found: ${resolved}`);
    process.exit(2);
  }

  const mod = await loadModule();
  const { kindsByCategory, ELEMENT_KIND_CATEGORIES } = mod;
  if (typeof kindsByCategory !== "function" || !ELEMENT_KIND_CATEGORIES) {
    console.error(
      "ERROR: Loaded module is missing `kindsByCategory` or `ELEMENT_KIND_CATEGORIES`.",
    );
    process.exit(2);
  }

  const grouped = kindsByCategory();
  const block = renderVocabulary(grouped, ELEMENT_KIND_CATEGORIES);

  const original = readFileSync(resolved, "utf8");
  const updated = splice(original, block);

  if (original === updated) {
    if (!checkMode) {
      console.log(`✓ ${targetPath} already up-to-date.`);
    }
    process.exit(0);
  }

  if (checkMode) {
    console.error(
      `✗ ${targetPath} is out of date with element-kinds.ts. Run the generator without --check to regenerate.`,
    );
    process.exit(1);
  }

  writeFileSync(resolved, updated, "utf8");
  console.log(`✓ Regenerated element-kinds section in ${targetPath}.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("ERROR:", err.message || err);
  process.exit(2);
});
