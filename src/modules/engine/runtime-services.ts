import type { Page } from "playwright";
import type { Assertion, Step } from "../dsl/schema.js";
import type { AssertionResult as AssertionEvaluation } from "../assertions/results.js";
import { AssertionEngine } from "../assertions/assertion-engine.js";
import type { IArtifactStorage } from "../store/artifact-storage.js";
import { LocalArtifactStorage } from "../store/artifact-storage.js";
import type { IResultStore } from "../store/result-store.js";
import { ResultStore } from "../store/result-store.js";
import type { ConsoleLogEntry, NetworkEntry, StepEvent } from "../logger/types.js";
import { TestLogger } from "../logger/logger.js";
import { ActionEngine } from "./action-engine.js";
import type { EngineConfig } from "./types.js";

export interface RuntimeActionEngine {
  launch(): Promise<void>;
  executeAll(steps: Step[]): Promise<StepEvent[]>;
  flushConsoleLogsForStep(stepId: string): ConsoleLogEntry[];
  getPage(): Page;
  getConsoleLogsByStep(): Map<string, ConsoleLogEntry[]>;
  close(): Promise<void>;
}

export interface RuntimeAssertionEngine {
  evaluateAll(
    page: Page,
    assertions: Assertion[],
    networkLog?: readonly NetworkEntry[],
  ): Promise<AssertionEvaluation[]>;
}

export type RuntimeResultStore = Pick<IResultStore, "saveRun" | "close">;

export interface RuntimeArtifactStorage extends IArtifactStorage {
  close?(): void | Promise<void>;
}

export interface RuntimeServices {
  createId(): string;
  now(): number;
  createLogger(): TestLogger;
  createActionEngine(
    logger: TestLogger,
    config: Partial<EngineConfig>,
  ): RuntimeActionEngine;
  createAssertionEngine(timeout: number): RuntimeAssertionEngine;
  createArtifactStorage(artifactDir: string): RuntimeArtifactStorage;
  createResultStore(resultsDb: string): RuntimeResultStore;
}

/** Production defaults used by the existing public tool facades. */
export function createDefaultRuntimeServices(): RuntimeServices {
  return {
    createId: () => crypto.randomUUID(),
    now: () => Date.now(),
    createLogger: () => new TestLogger({ stdout: false, collect: true }),
    createActionEngine: (logger, config) => new ActionEngine(logger, config),
    createAssertionEngine: (timeout) => new AssertionEngine(timeout),
    createArtifactStorage: (artifactDir) => new LocalArtifactStorage(artifactDir),
    createResultStore: (resultsDb) => new ResultStore(resultsDb),
  };
}
