/**
 * @repo/qa-agent ESLint plugin — locks the testid registry's contract.
 *
 * Exports:
 *   - `noNonLiteralTestid` — the rule itself.
 *   - `rules` — a flat-config-friendly `{ "no-non-literal-testid": rule }`
 *     map, consumed by `@repo/config-eslint` which aggregates all repo
 *     rules under a single `@repo` plugin namespace.
 *
 * Per §10.3 of artifacts/analysis/qa-agent-grammar-migration-plan.md. The
 * rule is wired into the root config via `@repo/config-eslint`; there is
 * no standalone `configs.recommended` fragment to import — consumers
 * should go through the aggregated plugin rather than this package.
 */

import { noNonLiteralTestid } from "./rules/no-non-literal-testid.js";

export const rules = {
  "no-non-literal-testid": noNonLiteralTestid,
};

export { noNonLiteralTestid };
