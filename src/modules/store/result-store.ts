import Database from "better-sqlite3";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  RunResult,
  ContractResult,
  StepResult,
  FailureSummary,
  FixHint,
} from "../types/index.js";
import type { NetworkEntry, ConsoleLogEntry } from "../logger/index.js";

// ─── Constants ───────────────────────────────────────────────────────────────

/** Current schema version. Bump this when the schema changes. */
const SCHEMA_VERSION = 2;

/** Default maximum number of runs to retain. Oldest are pruned on each saveRun. */
const DEFAULT_MAX_RUNS = 50;

// ─── Schema ──────────────────────────────────────────────────────────────────
//
// All data is stored in normalized tables. The ONLY JSON columns are
// network_logs.request_body and network_logs.response_body — HTTP bodies are
// arbitrary-shaped data that cannot be practically normalized into rows.
// Everything else is a scalar column or a key-value child table.

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS schema_version (
    version INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS runs (
    run_id        TEXT PRIMARY KEY,
    trace_id      TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
    total_contracts INTEGER NOT NULL,
    passed        INTEGER NOT NULL,
    failed        INTEGER NOT NULL,
    duration_ms   INTEGER,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contracts (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id        TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    intent        TEXT NOT NULL,
    status        TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'error')),
    duration_ms   INTEGER NOT NULL,
    passed_count  INTEGER NOT NULL,
    failed_count  INTEGER NOT NULL,
    root_failure_layer    TEXT,
    root_failure_cause    TEXT,
    root_failure_step_id  TEXT,
    contract_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS steps (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id         INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    step_id             TEXT NOT NULL,
    type                TEXT NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('passed', 'failed', 'skipped')),
    duration_ms         INTEGER NOT NULL,
    error_type          TEXT,
    error_message       TEXT,
    target_ref          TEXT,
    selector            TEXT,
    value               TEXT,
    before_screenshot   TEXT,
    after_screenshot    TEXT,
    dom_snapshot        TEXT,
    step_index          INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS step_error_details (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id   INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    key       TEXT NOT NULL,
    value     TEXT
  );

  CREATE TABLE IF NOT EXISTS assertions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id     INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    assertion_id    TEXT NOT NULL,
    domain          TEXT NOT NULL CHECK (domain IN ('ui', 'api')),
    type            TEXT NOT NULL,
    target_ref      TEXT,
    endpoint_ref    TEXT,
    status          TEXT NOT NULL CHECK (status IN ('passed', 'failed')),
    assertion_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS assertion_expected (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assertion_id    INTEGER NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    value           TEXT
  );

  CREATE TABLE IF NOT EXISTS assertion_actual (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assertion_id    INTEGER NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    value           TEXT
  );

  CREATE TABLE IF NOT EXISTS assertion_diagnostics (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    assertion_id    INTEGER NOT NULL REFERENCES assertions(id) ON DELETE CASCADE,
    key             TEXT NOT NULL,
    value           TEXT
  );

  CREATE TABLE IF NOT EXISTS failures (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id   INTEGER,
    run_id        TEXT NOT NULL REFERENCES runs(run_id) ON DELETE CASCADE,
    intent        TEXT NOT NULL,
    layer         TEXT NOT NULL CHECK (layer IN ('ui', 'api', 'business')),
    issue         TEXT NOT NULL,
    location      TEXT,
    failure_index INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS fix_hints (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    failure_id    INTEGER NOT NULL REFERENCES failures(id) ON DELETE CASCADE,
    type          TEXT NOT NULL CHECK (type IN ('frontend', 'backend', 'test')),
    suggestion    TEXT NOT NULL,
    target_file   TEXT,
    target_function TEXT,
    target_endpoint TEXT,
    hint_index    INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS network_logs (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    contract_id       INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
    method            TEXT NOT NULL,
    url               TEXT NOT NULL,
    status            INTEGER,
    request_body      TEXT,
    response_body     TEXT,
    duration_ms       INTEGER,
    log_index         INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS network_log_headers (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    log_id    INTEGER NOT NULL REFERENCES network_logs(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('request', 'response')),
    name      TEXT NOT NULL,
    value     TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS console_logs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    step_id       INTEGER NOT NULL REFERENCES steps(id) ON DELETE CASCADE,
    level         TEXT NOT NULL CHECK (level IN ('log', 'info', 'warn', 'error', 'debug', 'pageerror')),
    message       TEXT NOT NULL,
    source_url    TEXT,
    line_number   INTEGER,
    log_index     INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_contracts_run_id ON contracts(run_id);
  CREATE INDEX IF NOT EXISTS idx_steps_contract_id ON steps(contract_id);
  CREATE INDEX IF NOT EXISTS idx_step_error_details_step_id ON step_error_details(step_id);
  CREATE INDEX IF NOT EXISTS idx_assertions_contract_id ON assertions(contract_id);
  CREATE INDEX IF NOT EXISTS idx_assertion_expected_assertion_id ON assertion_expected(assertion_id);
  CREATE INDEX IF NOT EXISTS idx_assertion_actual_assertion_id ON assertion_actual(assertion_id);
  CREATE INDEX IF NOT EXISTS idx_assertion_diagnostics_assertion_id ON assertion_diagnostics(assertion_id);
  CREATE INDEX IF NOT EXISTS idx_failures_run_id ON failures(run_id);
  CREATE INDEX IF NOT EXISTS idx_fix_hints_failure_id ON fix_hints(failure_id);
  CREATE INDEX IF NOT EXISTS idx_network_logs_contract_id ON network_logs(contract_id);
  CREATE INDEX IF NOT EXISTS idx_network_log_headers_log_id ON network_log_headers(log_id);
  CREATE INDEX IF NOT EXISTS idx_console_logs_step_id ON console_logs(step_id);
  CREATE INDEX IF NOT EXISTS idx_runs_created_at ON runs(created_at);
  CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
`;

// Re-export ConsoleLogEntry from the canonical location (logger module)
export type { ConsoleLogEntry } from "../logger/index.js";

// ─── ResultStore ─────────────────────────────────────────────────────────────

export interface ResultStoreOptions {
  /** Maximum number of runs to retain. Oldest are pruned on each saveRun. Default: 50. */
  maxRuns?: number;
}

export interface IResultStore {
  saveRun(
    result: RunResult,
    options?: {
      networkLogs?: Map<number, NetworkEntry[]>;
      consoleLogs?: Map<string, ConsoleLogEntry[]>;
    }
  ): void;
  getLatestRun(): RunResult | null;
  getRun(runId: string): RunResult | null;
  listRuns(limit?: number): Array<{
    runId: string;
    traceId: string;
    status: string;
    summary: { totalContracts: number; passed: number; failed: number };
    createdAt: string;
  }>;
  getStepScreenshots(runId: string, stepId: string): {
    beforeScreenshot?: string;
    afterScreenshot?: string;
  } | null;
  getFailedSteps(runId: string): Array<{
    stepId: string;
    intent: string;
    type: string;
    errorType?: string;
    errorMessage?: string;
    beforeScreenshot?: string;
    afterScreenshot?: string;
    domSnapshot?: string;
    targetRef?: string;
    selector?: string;
    consoleLogs: ConsoleLogEntry[];
  }>;
  getNetworkLogs(runId: string, contractIndex: number): NetworkEntry[];
  getRunNetworkLogs(runId: string): Map<number, NetworkEntry[]>;
  getConsoleLogs(runId: string, stepId: string): ConsoleLogEntry[];
  getRunConsoleLogs(runId: string): ConsoleLogEntry[];
  /** Prune old runs beyond the retention limit. Called automatically on saveRun. */
  pruneOldRuns(): number;
  /** Get the current schema version stored in the DB. */
  getSchemaVersion(): number;
  close(): void;
}

/**
 * SQLite-backed result store for QA Intel test runs.
 *
 * All data is stored in normalized tables. The only JSON TEXT columns are
 * network_logs.request_body and network_logs.response_body — HTTP bodies are
 * arbitrary-shaped data that cannot be practically normalized.
 *
 * Everything else (error details, assertion expected/actual, headers,
 * diagnostics, fix hints) is stored in key-value child tables with individual
 * rows, fully queryable via SQL without JSON functions.
 *
 * Features:
 * - **Schema versioning**: a `schema_version` table tracks the DB schema.
 *   If the DB was created with an older version, it is automatically dropped
 *   and recreated. No manual deletion needed.
 * - **Retention policy**: old runs beyond `maxRuns` are automatically pruned
 *   (CASCADE deletes all child rows) on each `saveRun()`.
 * - **Concurrent write safety**: uses SQLite WAL mode + `busy_timeout` so
 *   concurrent processes wait rather than fail with SQLITE_BUSY.
 */
export class ResultStore implements IResultStore {
  private db: Database.Database;
  private maxRuns: number;

  constructor(dbPath: string = ".qa-results/results.db", options?: ResultStoreOptions) {
    this.maxRuns = options?.maxRuns ?? DEFAULT_MAX_RUNS;

    const absPath = resolve(dbPath);
    mkdirSync(dirname(absPath), { recursive: true });
    this.db = new Database(absPath);

    // Concurrent write safety: wait up to 5 seconds for locks to release
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");

    // Schema versioning: check if DB is compatible, recreate if not
    this._ensureSchema();
  }

  /**
   * Check the stored schema version and recreate if outdated.
   * This avoids silent corruption when the schema changes between releases.
   */
  private _ensureSchema(): void {
    // Check if schema_version table exists
    const hasVersionTable = this.db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'
    `).get();

    if (hasVersionTable) {
      const row = this.db.prepare(`SELECT version FROM schema_version LIMIT 1`).get() as { version: number } | undefined;
      const storedVersion = row?.version ?? 0;

      if (storedVersion === SCHEMA_VERSION) {
        // Schema is current — nothing to do
        return;
      }

      // Schema is outdated — drop all tables and recreate
      this._dropAllTables();
    }

    // Create fresh schema
    this.db.exec(SCHEMA_SQL);

    // Upsert version
    const count = this.db.prepare(`SELECT COUNT(*) as cnt FROM schema_version`).get() as { cnt: number };
    if (count.cnt === 0) {
      this.db.prepare(`INSERT INTO schema_version (version) VALUES (?)`).run(SCHEMA_VERSION);
    } else {
      this.db.prepare(`UPDATE schema_version SET version = ?`).run(SCHEMA_VERSION);
    }
  }

  /**
   * Drop all application tables. Used during schema migration.
   */
  private _dropAllTables(): void {
    const tables = [
      "console_logs", "network_log_headers", "network_logs",
      "fix_hints", "failures",
      "assertion_diagnostics", "assertion_actual", "assertion_expected", "assertions",
      "step_error_details", "steps", "contracts", "runs",
      "schema_version",
    ];
    for (const table of tables) {
      this.db.exec(`DROP TABLE IF EXISTS ${table}`);
    }
  }

  saveRun(
    result: RunResult,
    options?: {
      networkLogs?: Map<number, NetworkEntry[]>;
      consoleLogs?: Map<string, ConsoleLogEntry[]>;
    }
  ): void {
    const insertRun = this.db.prepare(`
      INSERT OR REPLACE INTO runs (run_id, trace_id, status, total_contracts, passed, failed, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertContract = this.db.prepare(`
      INSERT INTO contracts (run_id, intent, status, duration_ms, passed_count, failed_count,
        root_failure_layer, root_failure_cause, root_failure_step_id, contract_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertStep = this.db.prepare(`
      INSERT INTO steps (contract_id, step_id, type, status, duration_ms,
        error_type, error_message, target_ref, selector, value,
        before_screenshot, after_screenshot, dom_snapshot, step_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertStepErrorDetail = this.db.prepare(`
      INSERT INTO step_error_details (step_id, key, value) VALUES (?, ?, ?)
    `);
    const insertAssertion = this.db.prepare(`
      INSERT INTO assertions (contract_id, assertion_id, domain, type, target_ref, endpoint_ref,
        status, assertion_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertAssertionExpected = this.db.prepare(`
      INSERT INTO assertion_expected (assertion_id, key, value) VALUES (?, ?, ?)
    `);
    const insertAssertionActual = this.db.prepare(`
      INSERT INTO assertion_actual (assertion_id, key, value) VALUES (?, ?, ?)
    `);
    const insertAssertionDiagnostic = this.db.prepare(`
      INSERT INTO assertion_diagnostics (assertion_id, key, value) VALUES (?, ?, ?)
    `);
    const insertFailure = this.db.prepare(`
      INSERT INTO failures (contract_id, run_id, intent, layer, issue, location, failure_index)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertFixHint = this.db.prepare(`
      INSERT INTO fix_hints (failure_id, type, suggestion, target_file, target_function, target_endpoint, hint_index)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertNetworkLog = this.db.prepare(`
      INSERT INTO network_logs (contract_id, method, url, status, request_body, response_body, duration_ms, log_index)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertNetworkLogHeader = this.db.prepare(`
      INSERT INTO network_log_headers (log_id, direction, name, value) VALUES (?, ?, ?, ?)
    `);
    const insertConsoleLog = this.db.prepare(`
      INSERT INTO console_logs (step_id, level, message, source_url, line_number, log_index)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      const runDurationMs = result.contracts.reduce((sum, c) => sum + c.durationMs, 0);

      insertRun.run(
        result.runId, result.traceId, result.status,
        result.summary.totalContracts, result.summary.passed, result.summary.failed,
        runDurationMs
      );

      for (let ci = 0; ci < result.contracts.length; ci++) {
        const contract = result.contracts[ci];
        const contractRow = insertContract.run(
          result.runId, contract.intent, contract.status, contract.durationMs,
          contract.summary.passed, contract.summary.failed,
          contract.failure?.layer ?? null, contract.failure?.rootCause ?? null,
          contract.failure?.causedByStep ?? null, ci
        );
        const contractId = contractRow.lastInsertRowid;

        // ── Steps ─────────────────────────────────────────────────────
        for (let si = 0; si < contract.steps.length; si++) {
          const step = contract.steps[si];
          const stepRow = insertStep.run(
            contractId, step.stepId, step.type, step.status, step.durationMs,
            step.error?.type ?? null, step.error?.message ?? null,
            step.targetRef ?? null, step.selector ?? null, step.value ?? null,
            step.artifacts.beforeScreenshot ?? null, step.artifacts.afterScreenshot ?? null,
            step.artifacts.domSnapshot ?? null, si
          );
          const stepDbId = stepRow.lastInsertRowid;

          // Error details → key-value rows
          if (step.error?.details) {
            flattenToKv(step.error.details, (key, value) => {
              insertStepErrorDetail.run(stepDbId, key, value);
            });
          }

          // Console logs
          const stepConsoleLogs = options?.consoleLogs?.get(step.stepId);
          if (stepConsoleLogs) {
            for (let li = 0; li < stepConsoleLogs.length; li++) {
              const log = stepConsoleLogs[li];
              insertConsoleLog.run(stepDbId, log.level, log.message, log.sourceUrl ?? null, log.lineNumber ?? null, li);
            }
          }
        }

        // ── Assertions ────────────────────────────────────────────────
        for (let ai = 0; ai < contract.assertions.length; ai++) {
          const assertion = contract.assertions[ai] as any;
          const assertionRow = insertAssertion.run(
            contractId, assertion.assertionId, assertion.domain, assertion.type,
            assertion.targetRef ?? null, assertion.endpointRef ?? null,
            assertion.status, ai
          );
          const assertionDbId = assertionRow.lastInsertRowid;

          // Expected → key-value rows
          if (assertion.expected != null) {
            flattenToKv(assertion.expected, (key, value) => {
              insertAssertionExpected.run(assertionDbId, key, value);
            });
          }

          // Actual → key-value rows
          if (assertion.actual != null) {
            flattenToKv(assertion.actual, (key, value) => {
              insertAssertionActual.run(assertionDbId, key, value);
            });
          }

          // Diagnostics → key-value rows
          if (assertion.diagnostics && typeof assertion.diagnostics === "object") {
            for (const [key, value] of Object.entries(assertion.diagnostics)) {
              if (value !== undefined && value !== null) {
                insertAssertionDiagnostic.run(assertionDbId, key, String(value));
              }
            }
          }
        }

        // ── Failures ──────────────────────────────────────────────────
        if (contract.failures) {
          for (let fi = 0; fi < contract.failures.length; fi++) {
            const failure = contract.failures[fi];
            const failureRow = insertFailure.run(
              contractId, result.runId, failure.intent, failure.layer,
              failure.issue, failure.location ?? null, fi
            );
            const failureDbId = failureRow.lastInsertRowid;

            if (failure.fixHints) {
              for (let hi = 0; hi < failure.fixHints.length; hi++) {
                const hint = failure.fixHints[hi];
                insertFixHint.run(
                  failureDbId, hint.type, hint.suggestion,
                  hint.target?.file ?? null, hint.target?.function ?? null,
                  hint.target?.endpoint ?? null, hi
                );
              }
            }
          }
        }

        // ── Network logs ──────────────────────────────────────────────
        const contractNetworkLogs = options?.networkLogs?.get(ci);
        if (contractNetworkLogs) {
          for (let ni = 0; ni < contractNetworkLogs.length; ni++) {
            const entry = contractNetworkLogs[ni];
            const logRow = insertNetworkLog.run(
              contractId, entry.method, entry.url, entry.status ?? null,
              entry.requestBody != null ? jsonStringify(entry.requestBody) : null,
              entry.responseBody != null ? jsonStringify(entry.responseBody) : null,
              entry.duration ?? null, ni
            );
            const logId = logRow.lastInsertRowid;

            // Request headers → individual rows
            if (entry.requestHeaders) {
              for (const [name, value] of Object.entries(entry.requestHeaders)) {
                insertNetworkLogHeader.run(logId, "request", name, value);
              }
            }
            // Response headers → individual rows
            if (entry.responseHeaders) {
              for (const [name, value] of Object.entries(entry.responseHeaders)) {
                insertNetworkLogHeader.run(logId, "response", name, value);
              }
            }
          }
        }
      }

      // ── Run-level failures ────────────────────────────────────────
      if (result.failures) {
        for (let fi = 0; fi < result.failures.length; fi++) {
          const failure = result.failures[fi];
          const isContractLevel = result.contracts.some(
            (c) => c.failures?.some((cf) => cf === failure)
          );
          if (isContractLevel) continue;

          const failureRow = insertFailure.run(
            null, result.runId, failure.intent, failure.layer,
            failure.issue, failure.location ?? null, fi
          );
          const failureDbId = failureRow.lastInsertRowid;

          if (failure.fixHints) {
            for (let hi = 0; hi < failure.fixHints.length; hi++) {
              const hint = failure.fixHints[hi];
              insertFixHint.run(
                failureDbId, hint.type, hint.suggestion,
                hint.target?.file ?? null, hint.target?.function ?? null,
                hint.target?.endpoint ?? null, hi
              );
            }
          }
        }
      }
    });

    transaction();

    // Prune old runs beyond the retention limit
    this.pruneOldRuns();
  }

  // ─── Retention ─────────────────────────────────────────────────────────────

  /**
   * Delete runs beyond the retention limit (oldest first).
   * CASCADE foreign keys ensure all child rows are deleted.
   * Returns the number of runs deleted.
   */
  pruneOldRuns(): number {
    const count = this.db.prepare(`SELECT COUNT(*) as cnt FROM runs`).get() as { cnt: number };
    if (count.cnt <= this.maxRuns) return 0;

    const toDelete = this.db.prepare(`
      SELECT run_id FROM runs ORDER BY created_at ASC LIMIT ?
    `).all(count.cnt - this.maxRuns) as Array<{ run_id: string }>;

    const deleteRun = this.db.prepare(`DELETE FROM runs WHERE run_id = ?`);
    const transaction = this.db.transaction(() => {
      for (const row of toDelete) {
        deleteRun.run(row.run_id);
      }
    });
    transaction();

    return toDelete.length;
  }

  /** Get the schema version stored in the DB. */
  getSchemaVersion(): number {
    try {
      const row = this.db.prepare(`SELECT version FROM schema_version LIMIT 1`).get() as { version: number } | undefined;
      return row?.version ?? 0;
    } catch {
      return 0;
    }
  }

  // ─── Read Methods ──────────────────────────────────────────────────────────

  getLatestRun(): RunResult | null {
    const row = this.db.prepare(`
      SELECT run_id FROM runs ORDER BY created_at DESC LIMIT 1
    `).get() as { run_id: string } | undefined;
    if (!row) return null;
    return this.getRun(row.run_id);
  }

  getRun(runId: string): RunResult | null {
    const runRow = this.db.prepare(`
      SELECT run_id, trace_id, status, total_contracts, passed, failed, duration_ms
      FROM runs WHERE run_id = ?
    `).get(runId) as any;
    if (!runRow) return null;

    const contractRows = this.db.prepare(`
      SELECT id, intent, status, duration_ms, passed_count, failed_count,
        root_failure_layer, root_failure_cause, root_failure_step_id
      FROM contracts WHERE run_id = ? ORDER BY contract_index
    `).all(runId) as any[];

    const contracts: ContractResult[] = contractRows.map((c: any) => {
      // Steps
      const stepRows = this.db.prepare(`
        SELECT id, step_id, type, status, duration_ms, error_type, error_message,
          target_ref, selector, value, before_screenshot, after_screenshot, dom_snapshot
        FROM steps WHERE contract_id = ? ORDER BY step_index
      `).all(c.id) as any[];

      const steps: StepResult[] = stepRows.map((s: any) => {
        // Load error details from child table
        let errorDetails: Record<string, any> | undefined;
        if (s.error_type) {
          const detailRows = this.db.prepare(`
            SELECT key, value FROM step_error_details WHERE step_id = ?
          `).all(s.id) as Array<{ key: string; value: string | null }>;
          if (detailRows.length > 0) {
            errorDetails = {};
            for (const d of detailRows) {
              errorDetails[d.key] = parseScalar(d.value);
            }
          }
        }

        return {
          stepId: s.step_id,
          type: s.type,
          status: s.status,
          durationMs: s.duration_ms,
          error: s.error_type
            ? { type: s.error_type, message: s.error_message, details: errorDetails }
            : undefined,
          targetRef: s.target_ref ?? undefined,
          selector: s.selector ?? undefined,
          value: s.value ?? undefined,
          artifacts: {
            beforeScreenshot: s.before_screenshot ?? undefined,
            afterScreenshot: s.after_screenshot ?? undefined,
            domSnapshot: s.dom_snapshot ?? undefined,
          },
        };
      });

      // Assertions
      const assertionRows = this.db.prepare(`
        SELECT id, assertion_id, domain, type, target_ref, endpoint_ref, status
        FROM assertions WHERE contract_id = ? ORDER BY assertion_index
      `).all(c.id) as any[];

      const assertions = assertionRows.map((a: any) => {
        const expected = readKvTable(this.db, "assertion_expected", "assertion_id", a.id);
        const actual = readKvTable(this.db, "assertion_actual", "assertion_id", a.id);
        const diagnostics = readKvTable(this.db, "assertion_diagnostics", "assertion_id", a.id);

        return {
          assertionId: a.assertion_id,
          domain: a.domain,
          type: a.type,
          targetRef: a.target_ref ?? undefined,
          endpointRef: a.endpoint_ref ?? undefined,
          status: a.status,
          expected: expected ? unflattenKv(expected) : undefined,
          actual: actual ? unflattenKv(actual) : undefined,
          diagnostics: diagnostics ?? undefined,
        };
      });

      // Failures
      const failureRows = this.db.prepare(`
        SELECT id, intent, layer, issue, location
        FROM failures WHERE contract_id = ? ORDER BY failure_index
      `).all(c.id) as any[];

      const failures: FailureSummary[] = failureRows.map((f: any) => {
        const hintRows = this.db.prepare(`
          SELECT type, suggestion, target_file, target_function, target_endpoint
          FROM fix_hints WHERE failure_id = ? ORDER BY hint_index
        `).all(f.id) as any[];

        const fixHints: FixHint[] = hintRows.map((h: any) => {
          const hint: FixHint = { type: h.type, suggestion: h.suggestion };
          if (h.target_file || h.target_function || h.target_endpoint) {
            hint.target = {
              file: h.target_file ?? undefined,
              function: h.target_function ?? undefined,
              endpoint: h.target_endpoint ?? undefined,
            };
          }
          return hint;
        });

        return {
          intent: f.intent,
          layer: f.layer,
          issue: f.issue,
          location: f.location ?? undefined,
          fixHints: fixHints.length > 0 ? fixHints : undefined,
        };
      });

      return {
        intent: c.intent,
        status: c.status,
        durationMs: c.duration_ms,
        steps,
        assertions,
        summary: { passed: c.passed_count, failed: c.failed_count },
        failure: c.root_failure_layer
          ? { layer: c.root_failure_layer, rootCause: c.root_failure_cause, causedByStep: c.root_failure_step_id ?? undefined }
          : undefined,
        failures: failures.length > 0 ? failures : undefined,
      } as ContractResult;
    });

    // Run-level failures
    const runFailureRows = this.db.prepare(`
      SELECT id, intent, layer, issue, location
      FROM failures WHERE run_id = ? AND contract_id IS NULL ORDER BY failure_index
    `).all(runId) as any[];

    const allFailures: FailureSummary[] = [];
    for (const contract of contracts) {
      if (contract.failures) allFailures.push(...contract.failures);
    }
    for (const f of runFailureRows) {
      const hintRows = this.db.prepare(`
        SELECT type, suggestion, target_file, target_function, target_endpoint
        FROM fix_hints WHERE failure_id = ? ORDER BY hint_index
      `).all(f.id) as any[];

      const fixHints: FixHint[] = hintRows.map((h: any) => {
        const hint: FixHint = { type: h.type, suggestion: h.suggestion };
        if (h.target_file || h.target_function || h.target_endpoint) {
          hint.target = {
            file: h.target_file ?? undefined,
            function: h.target_function ?? undefined,
            endpoint: h.target_endpoint ?? undefined,
          };
        }
        return hint;
      });

      allFailures.push({
        intent: f.intent,
        layer: f.layer,
        issue: f.issue,
        location: f.location ?? undefined,
        fixHints: fixHints.length > 0 ? fixHints : undefined,
      });
    }

    return {
      runId: runRow.run_id,
      traceId: runRow.trace_id,
      status: runRow.status,
      summary: { totalContracts: runRow.total_contracts, passed: runRow.passed, failed: runRow.failed },
      contracts,
      failures: allFailures,
    };
  }

  listRuns(limit: number = 20) {
    const rows = this.db.prepare(`
      SELECT run_id, trace_id, status, total_contracts, passed, failed, created_at
      FROM runs ORDER BY created_at DESC LIMIT ?
    `).all(limit) as any[];

    return rows.map((r: any) => ({
      runId: r.run_id,
      traceId: r.trace_id,
      status: r.status,
      summary: { totalContracts: r.total_contracts, passed: r.passed, failed: r.failed },
      createdAt: r.created_at,
    }));
  }

  getStepScreenshots(runId: string, stepId: string) {
    const row = this.db.prepare(`
      SELECT s.before_screenshot, s.after_screenshot
      FROM steps s JOIN contracts c ON s.contract_id = c.id
      WHERE c.run_id = ? AND s.step_id = ?
    `).get(runId, stepId) as any;
    if (!row) return null;
    return {
      beforeScreenshot: row.before_screenshot ?? undefined,
      afterScreenshot: row.after_screenshot ?? undefined,
    };
  }

  getFailedSteps(runId: string) {
    const rows = this.db.prepare(`
      SELECT s.id, s.step_id, c.intent, s.type, s.error_type, s.error_message,
        s.before_screenshot, s.after_screenshot, s.dom_snapshot, s.target_ref, s.selector
      FROM steps s JOIN contracts c ON s.contract_id = c.id
      WHERE c.run_id = ? AND s.status = 'failed'
      ORDER BY c.contract_index, s.step_index
    `).all(runId) as any[];

    return rows.map((r: any) => {
      const logRows = this.db.prepare(`
        SELECT level, message, source_url, line_number
        FROM console_logs WHERE step_id = ? ORDER BY log_index
      `).all(r.id) as any[];

      return {
        stepId: r.step_id,
        intent: r.intent,
        type: r.type,
        errorType: r.error_type ?? undefined,
        errorMessage: r.error_message ?? undefined,
        beforeScreenshot: r.before_screenshot ?? undefined,
        afterScreenshot: r.after_screenshot ?? undefined,
        domSnapshot: r.dom_snapshot ?? undefined,
        targetRef: r.target_ref ?? undefined,
        selector: r.selector ?? undefined,
        consoleLogs: logRows.map((l: any) => ({
          level: l.level,
          message: l.message,
          sourceUrl: l.source_url ?? undefined,
          lineNumber: l.line_number ?? undefined,
        })),
      };
    });
  }

  getNetworkLogs(runId: string, contractIndex: number): NetworkEntry[] {
    const contractRow = this.db.prepare(`
      SELECT id FROM contracts WHERE run_id = ? AND contract_index = ?
    `).get(runId, contractIndex) as { id: number } | undefined;
    if (!contractRow) return [];
    return this._loadNetworkLogs(contractRow.id);
  }

  getRunNetworkLogs(runId: string): Map<number, NetworkEntry[]> {
    const contractRows = this.db.prepare(`
      SELECT id, contract_index FROM contracts WHERE run_id = ? ORDER BY contract_index
    `).all(runId) as Array<{ id: number; contract_index: number }>;

    const result = new Map<number, NetworkEntry[]>();
    for (const c of contractRows) {
      result.set(c.contract_index, this._loadNetworkLogs(c.id));
    }
    return result;
  }

  getConsoleLogs(runId: string, stepId: string): ConsoleLogEntry[] {
    const rows = this.db.prepare(`
      SELECT cl.level, cl.message, cl.source_url, cl.line_number
      FROM console_logs cl
      JOIN steps s ON cl.step_id = s.id
      JOIN contracts c ON s.contract_id = c.id
      WHERE c.run_id = ? AND s.step_id = ?
      ORDER BY cl.log_index
    `).all(runId, stepId) as any[];

    return rows.map((r: any) => ({
      level: r.level,
      message: r.message,
      sourceUrl: r.source_url ?? undefined,
      lineNumber: r.line_number ?? undefined,
    }));
  }

  getRunConsoleLogs(runId: string): ConsoleLogEntry[] {
    const rows = this.db.prepare(`
      SELECT cl.level, cl.message, cl.source_url, cl.line_number
      FROM console_logs cl
      JOIN steps s ON cl.step_id = s.id
      JOIN contracts c ON s.contract_id = c.id
      WHERE c.run_id = ?
      ORDER BY c.contract_index, s.step_index, cl.log_index
    `).all(runId) as any[];

    return rows.map((r: any) => ({
      level: r.level,
      message: r.message,
      sourceUrl: r.source_url ?? undefined,
      lineNumber: r.line_number ?? undefined,
    }));
  }

  close(): void {
    this.db.close();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private _loadNetworkLogs(contractId: number | bigint): NetworkEntry[] {
    const rows = this.db.prepare(`
      SELECT id, method, url, status, request_body, response_body, duration_ms
      FROM network_logs WHERE contract_id = ? ORDER BY log_index
    `).all(contractId) as any[];

    return rows.map((r: any) => {
      // Load headers from child table
      const headerRows = this.db.prepare(`
        SELECT direction, name, value FROM network_log_headers WHERE log_id = ?
      `).all(r.id) as Array<{ direction: string; name: string; value: string }>;

      const requestHeaders: Record<string, string> = {};
      const responseHeaders: Record<string, string> = {};
      for (const h of headerRows) {
        if (h.direction === "request") requestHeaders[h.name] = h.value;
        else responseHeaders[h.name] = h.value;
      }

      return {
        method: r.method,
        url: r.url,
        status: r.status ?? undefined,
        requestHeaders: Object.keys(requestHeaders).length > 0 ? requestHeaders : undefined,
        responseHeaders: Object.keys(responseHeaders).length > 0 ? responseHeaders : undefined,
        requestBody: r.request_body ? jsonParse(r.request_body) : undefined,
        responseBody: r.response_body ? jsonParse(r.response_body) : undefined,
        duration: r.duration_ms ?? undefined,
      };
    });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * JSON stringify for HTTP bodies only. These are the only JSON TEXT columns in
 * the schema — bodies are arbitrary-shaped data that cannot be normalized.
 */
function jsonStringify(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/**
 * JSON parse for HTTP bodies only.
 */
function jsonParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/**
 * Flatten a value into key-value pairs for storage in a child table.
 * - Primitives (string, number, boolean): stored as single row with key "_value"
 * - Objects: each property becomes a row with the property name as key
 * - Nested objects: dot-notation keys (e.g. "user.email")
 */
function flattenToKv(
  value: unknown,
  emit: (key: string, value: string | null) => void,
  prefix: string = ""
): void {
  if (value === null || value === undefined) return;

  if (typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${k}` : k;
      if (v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v)) {
        flattenToKv(v, emit, fullKey);
      } else {
        emit(fullKey, v != null ? String(v) : null);
      }
    }
  } else {
    // Primitive or array — store as single _value row
    emit(prefix || "_value", String(value));
  }
}

/**
 * Read key-value rows from a child table. Returns null if no rows exist.
 */
function readKvTable(
  db: Database.Database,
  table: string,
  fkColumn: string,
  fkValue: number | bigint
): Record<string, any> | null {
  const rows = db.prepare(`
    SELECT key, value FROM ${table} WHERE ${fkColumn} = ?
  `).all(fkValue) as Array<{ key: string; value: string | null }>;

  if (rows.length === 0) return null;

  const result: Record<string, any> = {};
  for (const r of rows) {
    result[r.key] = parseScalar(r.value);
  }
  return result;
}

/**
 * Unflatten dot-notation key-value pairs back into an object.
 * If all keys are simple (no dots), returns as-is.
 * Special key "_value" returns the primitive directly.
 */
function unflattenKv(kv: Record<string, any>): any {
  // Single primitive value
  if ("_value" in kv && Object.keys(kv).length === 1) {
    return kv["_value"];
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(kv)) {
    const parts = key.split(".");
    let current = result;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in current)) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
  }
  return result;
}

/**
 * Parse a scalar string value back to its JS type.
 * "true"/"false" → boolean, numeric strings → number, everything else → string.
 */
function parseScalar(value: string | null): any {
  if (value === null) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  // Check for numeric (integer or float, not hex/octal)
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    const num = Number(value);
    if (!isNaN(num)) return num;
  }
  return value;
}
