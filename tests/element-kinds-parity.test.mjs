import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Repo root = packages/qa-agent/tests/../../..
const REPO_ROOT = resolve(__dirname, "..", "..", "..");
const GENERATOR = resolve(
  REPO_ROOT,
  "packages",
  "qa-agent",
  "scripts",
  "generate-element-kinds-doc.mjs",
);

const COPIES = [
  {
    name: "authoritative (.agents/skills/qa-testing/references/)",
    path: resolve(
      REPO_ROOT,
      ".agents",
      "skills",
      "qa-testing",
      "references",
      "gherkin-step-syntax.md",
    ),
  },
  {
    name: "mirror (.kilocode/skills/epic-to-gherkin/references/)",
    path: resolve(
      REPO_ROOT,
      ".kilocode",
      "skills",
      "epic-to-gherkin",
      "references",
      "gherkin-step-syntax.md",
    ),
  },
];

/**
 * Run the generator against a tmp copy of the committed file and diff the
 * result against the committed file. Any byte-level difference fails the test.
 */
function runParity(sourcePath) {
  const tmpDir = mkdtempSync(join(tmpdir(), "element-kinds-parity-"));
  try {
    const tmpFile = join(tmpDir, "gherkin-step-syntax.md");
    copyFileSync(sourcePath, tmpFile);
    execFileSync("node", [GENERATOR, tmpFile], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const committed = readFileSync(sourcePath, "utf8");
    const regenerated = readFileSync(tmpFile, "utf8");
    return { committed, regenerated };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

describe("element-kinds parity: TS module ↔ markdown", () => {
  for (const { name, path } of COPIES) {
    it(`${name} matches the generated vocabulary byte-for-byte`, () => {
      const { committed, regenerated } = runParity(path);
      if (committed !== regenerated) {
        // Produce a compact line-level diff for easier debugging.
        const cLines = committed.split("\n");
        const rLines = regenerated.split("\n");
        const maxLen = Math.max(cLines.length, rLines.length);
        const diffs = [];
        for (let i = 0; i < maxLen; i++) {
          if (cLines[i] !== rLines[i]) {
            diffs.push(
              `  line ${i + 1}:\n    committed:   ${JSON.stringify(cLines[i])}\n    regenerated: ${JSON.stringify(rLines[i])}`,
            );
            if (diffs.length >= 10) break;
          }
        }
        assert.fail(
          `Element-kinds vocabulary drift in ${path}.\n` +
            `The TS module and markdown are out of sync.\n` +
            `Run: node packages/qa-agent/scripts/generate-element-kinds-doc.mjs ${path}\n\n` +
            `First differing lines:\n${diffs.join("\n")}`,
        );
      }
      assert.equal(committed, regenerated);
    });
  }
});
