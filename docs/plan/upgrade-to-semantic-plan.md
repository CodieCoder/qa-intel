# Eliminate contracts.json and Implement Auto-Healing

This plan outlines the steps to remove the brittle dependency on `data-testid` scanning (`contracts.json`) and replace it with Semantic Locators. It also outlines the architecture for an Auto-Healing mechanism that recovers from UI changes dynamically.

## User Review Required

> [!WARNING]
> **Breaking Change**: This will break any existing workflows that rely on passing `contracts.json` to the `qa-runner` CLI. The CLI signature will change from `qa-runner run suite.json contracts.json` to `qa-runner run suite.json`.
> Existing `.feature` files using raw testids (e.g., `When I click login-submit`) will now be interpreted as text locators or will fail unless updated to semantic definitions (e.g., `When I click the button "Login"`).

## Decisions Made

1. **Auto-Healing LLM Configuration**: Implemented via an Adapter pattern. The framework will define an `LLMProvider` interface, allowing any LLM to be plugged in. We will start with an OpenAI implementation.
2. **Auto-Healing Input**: The LLM will receive the Playwright Accessibility Tree and the current screenshot to ground its decision. (Future extensibility will allow tool use to query deeper).
3. **Legacy Selector Support**: If `targetRef` starts with `#`, `.`, or `[`, it will be treated as a direct CSS selector and bypass semantic resolution.

## Proposed Changes

---

### CLI & Configuration Layer

We need to update the CLI to stop requiring and generating `contracts.json`.

#### [MODIFY] `src/cli.ts`
- Remove all imports related to `UIContractMap`.
- `compileFeature`: Stop generating `contracts.json`. Only output `suite.json`.
- `compileAndRun`: Update argument parsing to accept only `<feature-file> [flags]`.
- `runSuite`: Update argument parsing to accept only `<suite.json> [flags]`.

---

### Contracts Module

The entire contract mapping layer is obsolete.

#### [DELETE] `src/modules/contracts/contract-map.ts`
#### [DELETE] `src/modules/contracts/index.ts`

---

### DSL / Compiler Layer

We need to update the Gherkin compiler to parse natural language targets (which might include spaces) rather than strict `\S+` test IDs, and disable the registry verification.

#### [MODIFY] `src/modules/dsl/gherkin-compiler.ts`
- Update Regex patterns to support quoted strings for targets.
  - Example old: `CLICK_DECLARATIVE_PATTERN = /^(?:I )?click the (\S+) (\S+)$/i;`
  - Example new: `CLICK_DECLARATIVE_PATTERN = /^(?:I )?click the (\S+) (?:["'](.+?)["']|(\S+))$/i;`
- Remove `verifyRegistry` logic (and PR 7 checks) since targets are now semantic strings, not guaranteed `data-testid`s.

#### [MODIFY] `src/modules/registry/index.ts`
- This whole module (static analysis of source code to find test IDs) can potentially be deprecated/deleted, but we can leave it untouched or remove its integration from the compiler to avoid unnecessary filesystem reads.

---

### Engine / Execution Layer

The core execution engine will drop the contract map and implement Playwright's semantic locators, wrapped with a self-healing retry loop.

#### [MODIFY] `src/modules/engine/action-engine.ts`
- **Constructor**: Remove `contractMap` dependency. Inject `AutoHealer`.
- **`performAction`**:
  - Check if `step.targetRef` starts with `#`, `.`, or `[`. If so, use it as a direct CSS selector.
  - Otherwise, use Playwright semantic locators.
  - If `step.kind` exists: `page.getByRole(step.kind, { name: step.targetRef })`.
  - If no kind exists: `page.getByText(step.targetRef)`.
- **`execute` (Auto-healing loop)**:
  - Inside the retry loop, if standard locators fail (e.g., TimeoutError), trigger `attemptAutoHealing(step)`.
  - `attemptAutoHealing`:
    1. Capture Playwright Accessibility Tree (`page.accessibility.snapshot()`).
    2. Capture current screenshot.
    3. Pass to `AutoHealer`, which uses the configured `LLMProvider` (OpenAI by default).
    4. Re-attempt action using the LLM's suggested selector.
  - If healing succeeds, emit the step event as `success` but log a `warn` indicating self-healing occurred, and save the fix hint to SQLite.

#### [NEW] `src/modules/auto-healing/index.ts`
- Define `LLMProvider` interface.
- Implement `OpenAIProvider`.
- Implement `AutoHealer` class orchestrating the healing prompt.

## Verification Plan

### Automated Tests
- Update/remove existing unit tests in `tests/` that check for `contracts.json` generation.
- Add a test that verifies `When I click the button "Login"` correctly calls Playwright's `getByRole('button', { name: 'Login' })`.

### Manual Verification
1. Run `qa-runner compile` on an existing feature file and verify only `suite.json` is generated.
2. Run `qa-runner run` on a UI with a slightly changed button text. Ensure the Auto-healing mechanism kicks in, finds the new button via the LLM, and successfully completes the run.

# Execution Tasks

- `[ ]` **Task 1: Update DSL Compiler**
  - Update `src/modules/dsl/gherkin-compiler.ts` regexes to support quoted strings.
  - Remove registry verification logic.
- `[x]` **Task 2: Remove Contracts Module**
  - Delete `src/modules/contracts/contract-map.ts`.
  - Delete `src/modules/contracts/index.ts`.
  - Remove `contracts` references from `src/index.ts`.
- `[x]` **Task 3: Update CLI**
  - Update `src/cli.ts` to stop generating and requiring `contracts.json`.
- `[x]` **Task 4: Build Auto-Healing Adapter Architecture**
  - Create `src/modules/auto-healing/types.ts` (`LLMProvider`).
  - Create `src/modules/auto-healing/openai-provider.ts`.
  - Create `src/modules/auto-healing/auto-healer.ts`.
  - Export from `src/modules/auto-healing/index.ts`.
- `[ ]` **Task 5: Update Engine to use Semantic Locators & Auto-Healing**
  - Update `src/modules/engine/action-engine.ts`.
  - Remove `UIContractMap`.
  - Implement CSS fallback (`#`, `.`, `[`).
  - Implement Semantic locators (`getByRole`, `getByText`).
  - Integrate `AutoHealer` in the `execute` loop.
- `[ ]` **Task 6: Verification**
  - Verify `qa-runner compile` works without contracts.
  - Ensure typechecks pass (`yarn typecheck`).
