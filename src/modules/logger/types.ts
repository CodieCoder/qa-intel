// ─── Log Event Types ─────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Browser console log entry — shared between ActionEngine (capture) and ResultStore (persistence). */
export interface ConsoleLogEntry {
  level: "log" | "info" | "warn" | "error" | "debug" | "pageerror";
  message: string;
  sourceUrl?: string;
  lineNumber?: number;
}

export interface NetworkEntry {
  method: string;
  url: string;
  status?: number;
  requestHeaders?: Record<string, string>;
  responseHeaders?: Record<string, string>;
  requestBody?: unknown;
  responseBody?: unknown;
  duration?: number;
}

export interface StepEvent {
  timestamp: number;
  type: string;
  targetRef?: string;
  value?: string;
  result: "success" | "failed" | "skipped";
  duration: number;
  selector?: string;
  /** Screenshot captured BEFORE the step executed (base64 PNG) */
  screenshotBefore?: string;
  /** Screenshot captured AFTER the step executed (base64 PNG) */
  screenshot?: string;
  network: NetworkEntry[];
  error?: string;
}

export interface AssertionEvent {
  timestamp: number;
  type: string;
  targetRef?: string;
  expected?: string;
  actual?: string;
  result: "passed" | "failed";
  error?: string;
}

export interface TestEvent {
  timestamp: number;
  intent: string;
  status: "started" | "passed" | "failed" | "error";
  traceId?: string;
  duration?: number;
  steps: StepEvent[];
  assertions: AssertionEvent[];
  error?: string;
}

export interface LogEntry {
  level: LogLevel;
  timestamp: number;
  message: string;
  data?: unknown;
}
