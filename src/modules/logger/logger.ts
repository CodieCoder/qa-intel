import { randomUUID } from "node:crypto";
import type {
  LogLevel,
  LogEntry,
  StepEvent,
  AssertionEvent,
  TestEvent,
  NetworkEntry,
} from "./types.js";

// ─── Logger Configuration ────────────────────────────────────────────────────

export interface LoggerConfig {
  level: LogLevel;
  /** Write JSON to stdout */
  stdout: boolean;
  /** Collect events in memory (for programmatic access) */
  collect: boolean;
}

const DEFAULT_CONFIG: LoggerConfig = {
  level: "info",
  stdout: true,
  collect: true,
};

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// ─── Test Logger ─────────────────────────────────────────────────────────────

export class TestLogger {
  private config: LoggerConfig;
  private logs: LogEntry[] = [];
  private steps: StepEvent[] = [];
  private assertionEvents: AssertionEvent[] = [];
  private networkLog: NetworkEntry[] = [];
  private traceId: string;
  private testStartTime: number = 0;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.traceId = randomUUID();
  }

  // ─── Trace ID ────────────────────────────────────────────────────────────

  getTraceId(): string {
    return this.traceId;
  }

  setTraceId(id: string): void {
    this.traceId = id;
  }

  // ─── Generic Logging ─────────────────────────────────────────────────────

  private shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[this.config.level];
  }

  private emit(entry: LogEntry): void {
    if (this.config.collect) {
      this.logs.push(entry);
    }
    if (this.config.stdout && this.shouldLog(entry.level)) {
      const output = JSON.stringify(entry);
      if (entry.level === "error") {
        process.stderr.write(output + "\n");
      } else {
        process.stdout.write(output + "\n");
      }
    }
  }

  debug(message: string, data?: unknown): void {
    this.emit({ level: "debug", timestamp: Date.now(), message, data });
  }

  info(message: string, data?: unknown): void {
    this.emit({ level: "info", timestamp: Date.now(), message, data });
  }

  warn(message: string, data?: unknown): void {
    this.emit({ level: "warn", timestamp: Date.now(), message, data });
  }

  error(message: string, data?: unknown): void {
    this.emit({ level: "error", timestamp: Date.now(), message, data });
  }

  // ─── Test Lifecycle ──────────────────────────────────────────────────────

  testStarted(intent: string): void {
    this.testStartTime = Date.now();
    this.steps = [];
    this.assertionEvents = [];
    this.networkLog = [];
    this.info(`Test started: ${intent}`, { intent, traceId: this.traceId });
  }

  testCompleted(intent: string, status: "passed" | "failed" | "error", error?: string): TestEvent {
    const event: TestEvent = {
      timestamp: this.testStartTime,
      intent,
      status,
      traceId: this.traceId,
      duration: Date.now() - this.testStartTime,
      steps: [...this.steps],
      assertions: [...this.assertionEvents],
      error,
    };

    this.info(`Test ${status}: ${intent}`, { intent, status, duration: event.duration });
    return event;
  }

  // ─── Step Events ─────────────────────────────────────────────────────────

  stepStarted(type: string, targetRef?: string): void {
    this.debug(`Step started: ${type} ${targetRef ?? ""}`, { type, targetRef });
  }

  stepCompleted(event: StepEvent): void {
    if (this.config.collect) {
      this.steps.push(event);
    }
    const level = event.result === "failed" ? "error" : "info";
    this.emit({
      level,
      timestamp: event.timestamp,
      message: `Step ${event.result}: ${event.type} ${event.targetRef ?? ""}`,
      data: {
        type: event.type,
        targetRef: event.targetRef,
        result: event.result,
        duration: event.duration,
        selector: event.selector,
        error: event.error,
      },
    });
  }

  // ─── Assertion Events ────────────────────────────────────────────────────

  assertionCompleted(event: AssertionEvent): void {
    if (this.config.collect) {
      this.assertionEvents.push(event);
    }
    const level = event.result === "failed" ? "error" : "info";
    this.emit({
      level,
      timestamp: event.timestamp,
      message: `Assertion ${event.result}: ${event.type} ${event.targetRef ?? ""}`,
      data: {
        type: event.type,
        targetRef: event.targetRef,
        result: event.result,
        expected: event.expected,
        actual: event.actual,
        error: event.error,
      },
    });
  }

  // ─── Network Logging ─────────────────────────────────────────────────────

  logNetwork(entry: NetworkEntry): void {
    if (this.config.collect) {
      this.networkLog.push(entry);
    }
    this.debug(`Network: ${entry.method} ${entry.url}`, entry);
  }

  // ─── Accessors ───────────────────────────────────────────────────────────

  getLogs(): readonly LogEntry[] {
    return this.logs;
  }

  getSteps(): readonly StepEvent[] {
    return this.steps;
  }

  getAssertions(): readonly AssertionEvent[] {
    return this.assertionEvents;
  }

  getNetworkLog(): readonly NetworkEntry[] {
    return this.networkLog;
  }

  // ─── Reset ───────────────────────────────────────────────────────────────

  reset(): void {
    this.logs = [];
    this.steps = [];
    this.assertionEvents = [];
    this.networkLog = [];
    this.traceId = randomUUID();
    this.testStartTime = 0;
  }
}
