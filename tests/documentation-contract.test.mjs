import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { REPO_ROOT } from "./runtime-test-helpers.mjs";

const requiredGuides = ["docs/extensibility.md", "docs/testing.md"];
const governanceFiles = [
  "README.md",
  "CONTRIBUTING.md",
  "AGENTS.md",
  "skills/qa-intel/SKILL.md",
];

function markdownFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return markdownFiles(path);
    return extname(entry.name) === ".md" ? [path] : [];
  });
}

function localMarkdownLinks(path) {
  const source = readFileSync(path, "utf8");
  return [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1].trim())
    .filter((target) =>
      target &&
      !target.startsWith("#") &&
      !/^(?:https?:|mailto:)/i.test(target),
    )
    .map((target) => decodeURIComponent(target.split("#", 1)[0]));
}

describe("documentation governance contract", () => {
  it("keeps the extensibility and testing guides discoverable", () => {
    for (const guide of requiredGuides) {
      assert.equal(existsSync(join(REPO_ROOT, guide)), true, `${guide} should exist`);
    }

    for (const file of governanceFiles) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      for (const guide of requiredGuides) {
        assert.match(source, new RegExp(guide.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      }
    }
  });

  it("documents material-decision questions and test-first development", () => {
    const agents = readFileSync(join(REPO_ROOT, "AGENTS.md"), "utf8");
    const contributing = readFileSync(join(REPO_ROOT, "CONTRIBUTING.md"), "utf8");
    const skill = readFileSync(join(REPO_ROOT, "skills/qa-intel/SKILL.md"), "utf8");

    assert.match(agents, /unresolved material decisions/i);
    assert.match(agents, /failing test/i);
    assert.match(contributing, /red.*green.*refactor/is);
    assert.match(skill, /unresolved material decisions/i);
    assert.match(skill, /failing test/i);
  });

  it("keeps local Markdown links valid", () => {
    const files = [
      ...governanceFiles.map((path) => join(REPO_ROOT, path)),
      ...markdownFiles(join(REPO_ROOT, "docs")),
    ];

    const broken = [];
    for (const file of files) {
      for (const target of localMarkdownLinks(file)) {
        const resolved = resolve(dirname(file), target);
        if (!existsSync(resolved)) {
          broken.push(`${relative(REPO_ROOT, file)} -> ${target}`);
        }
      }
    }

    assert.deepEqual(broken, []);
  });
});
