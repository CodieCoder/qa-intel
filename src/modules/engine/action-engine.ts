import {
  chromium,
  type Page,
  type Browser,
  type BrowserContext,
} from "playwright";
import type { Step } from "../dsl/index.js";
import { AutoHealer, type HealingContext } from "../auto-healing/index.js";
import { describeLocator, inspectLocator, resolveLocator } from "../locators/index.js";
import {
  TestLogger,
  type StepEvent,
  type ConsoleLogEntry,
} from "../logger/index.js";
import {
  type EngineConfig,
  type ActionResult,
  DEFAULT_ENGINE_CONFIG,
} from "./types.js";
import { resolveRuntimeEnvPlaceholders } from "./runtime-env-placeholders.js";
import { createBrowserLaunchError, resolveBrowserSelection } from "./browser-selection.js";

function expandStepValue(value: string): string {
  return /\{\{[A-Z]/.test(value) ? resolveRuntimeEnvPlaceholders(value) : value;
}

// Re-export so existing imports from action-engine.ts continue to work
export type { ConsoleLogEntry } from "../logger/index.js";

// ─── Action Engine ───────────────────────────────────────────────────────────

export class ActionEngine {
  private config: EngineConfig;
  private logger: TestLogger;
  private autoHealer: AutoHealer;
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  /** Console logs captured per step. Key = stepId assigned during execution. */
  private consoleLogs: ConsoleLogEntry[] = [];
  /** Buffer for console logs captured during the current step. */
  private currentStepConsoleLogs: ConsoleLogEntry[] = [];
  /** All console logs for the entire contract execution, keyed by stepId. */
  private consoleLogsByStep: Map<string, ConsoleLogEntry[]> = new Map();

  constructor(
    logger: TestLogger,
    config?: Partial<EngineConfig>,
  ) {
    this.config = { ...DEFAULT_ENGINE_CONFIG, ...config };
    this.logger = logger;
    this.autoHealer = new AutoHealer();
  }

  // ─── Lifecycle ───────────────────────────────────────────────────────────

  async launch(): Promise<void> {
    const browserSelection = resolveBrowserSelection(this.config);
    this.logger.info("Launching browser", {
      headless: this.config.headless,
      viewport: this.config.viewport,
      browserSelection: {
        kind: browserSelection.kind,
        source: browserSelection.source,
        executablePath: browserSelection.executablePath,
        channel: browserSelection.channel,
      },
    });

    try {
      this.browser = await chromium.launch({
        headless: this.config.headless,
        slowMo: this.config.slowMo,
        ...browserSelection.launchOptions,
      });
    } catch (err) {
      throw createBrowserLaunchError(err, browserSelection);
    }

    this.context = await this.browser.newContext({
      viewport: this.config.viewport,
      // Correlation id on outbound requests. Use X-Correlation-Id to match the
      // backend's CORS allowed headers (Content-Type, Authorization, X-Correlation-Id,
      // X-Idempotency-Key). A disallowed custom header blocks browser XHR/fetch via
      // CORS preflight.
      extraHTTPHeaders: {
        "X-Correlation-Id": this.logger.getTraceId(),
      },
    });

    this.page = await this.context.newPage();

    // Set up network logging — only capture API/XHR calls, skip static assets
    this.page.on("response", async (response) => {
      const url = response.url();

      // Filter out noise: static assets, framework internals, HMR, etc.
      if (this.isStaticAsset(url)) return;

      const request = response.request();

      // Also filter by resource type — only interested in XHR/fetch and document navigations
      const resourceType = request.resourceType();
      if (
        resourceType !== "xhr" &&
        resourceType !== "fetch" &&
        resourceType !== "document"
      )
        return;

      let responseBody: unknown;

      try {
        const contentType = response.headers()["content-type"] ?? "";
        if (contentType.includes("application/json")) {
          responseBody = await response.json();
        } else if (contentType.includes("text/")) {
          responseBody = await response.text();
        }
      } catch {
        // Response body may not be available (e.g. redirects, streaming)
      }

      let requestBody: unknown;
      const postData = request.postData();
      if (postData) {
        try {
          requestBody = JSON.parse(postData);
        } catch {
          requestBody = postData;
        }
      }

      this.logger.logNetwork({
        method: request.method(),
        url,
        status: response.status(),
        requestHeaders: request.headers(),
        responseHeaders: response.headers(),
        requestBody,
        responseBody,
      });
    });

    // Set up console log capture — captures console.log/info/warn/error/debug
    this.page.on("console", (msg) => {
      const type = msg.type();
      const level = (
        type === "warning"
          ? "warn"
          : ["log", "info", "warn", "error", "debug"].includes(type)
            ? type
            : "log"
      ) as ConsoleLogEntry["level"];

      const location = msg.location();
      const entry: ConsoleLogEntry = {
        level,
        message: msg.text(),
        sourceUrl: location.url || undefined,
        lineNumber:
          location.lineNumber != null ? location.lineNumber : undefined,
      };

      this.currentStepConsoleLogs.push(entry);
      this.consoleLogs.push(entry);
    });

    // Set up pageerror capture — captures uncaught JS exceptions
    this.page.on("pageerror", (error) => {
      const entry: ConsoleLogEntry = {
        level: "pageerror",
        message: error.message,
      };
      this.currentStepConsoleLogs.push(entry);
      this.consoleLogs.push(entry);
    });
  }

  /**
   * Returns true if the URL points to a static asset that should be excluded
   * from network logging (framework bundles, fonts, images, CSS, sourcemaps, etc.)
   */
  private isStaticAsset(url: string): boolean {
    // Common static asset path patterns
    if (url.includes("/_next/static/")) return true;
    if (url.includes("/__nextjs_")) return true;
    if (url.includes("/_next/image")) return true;
    if (url.includes("/favicon")) return true;

    // File extension based filtering
    const extensionMatch = url.match(/\.([a-z0-9]+)(?:\?|#|$)/i);
    if (extensionMatch) {
      const ext = extensionMatch[1].toLowerCase();
      const staticExtensions = new Set([
        "js",
        "css",
        "map", // bundles, styles, sourcemaps
        "woff",
        "woff2",
        "ttf",
        "otf", // fonts
        "png",
        "jpg",
        "jpeg",
        "gif",
        "svg",
        "webp",
        "ico",
        "avif", // images
        "mp4",
        "webm",
        "ogg", // media
      ]);
      if (staticExtensions.has(ext)) return true;
    }

    return false;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
      this.logger.info("Browser closed");
    }
  }

  getPage(): Page {
    if (!this.page) {
      throw new Error("Engine not launched. Call launch() first.");
    }
    return this.page;
  }

  // ─── Console Log Accessors ──────────────────────────────────────────────

  /**
   * Flush the current step's console log buffer and associate it with the given stepId.
   * Call this after each step execution in executeContract to bind logs to step IDs.
   */
  flushConsoleLogsForStep(stepId: string): ConsoleLogEntry[] {
    const logs = [...this.currentStepConsoleLogs];
    this.consoleLogsByStep.set(stepId, logs);
    this.currentStepConsoleLogs = [];
    return logs;
  }

  /** Get all console logs captured for a specific step. */
  getConsoleLogsForStep(stepId: string): ConsoleLogEntry[] {
    return this.consoleLogsByStep.get(stepId) ?? [];
  }

  /** Get all console logs captured during the entire engine lifetime. */
  getAllConsoleLogs(): ConsoleLogEntry[] {
    return [...this.consoleLogs];
  }

  /** Get all console logs keyed by stepId. */
  getConsoleLogsByStep(): Map<string, ConsoleLogEntry[]> {
    return new Map(this.consoleLogsByStep);
  }

  // ─── Execute a single step ──────────────────────────────────────────────

  async execute(step: Step): Promise<StepEvent> {
    const startTime = Date.now();
    const stepDesc = this.describeStep(step);

    this.logger.stepStarted(
      step.type,
      this.stepTarget(step),
    );

    // Reset per-step console buffer
    this.currentStepConsoleLogs = [];

    // Capture BEFORE screenshot (page state before this step runs)
    const screenshotBefore = await this.captureScreenshot();

    let lastError: Error | null = null;
    let result: ActionResult | null = null;

    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      try {
        if (attempt > 0) {
          this.logger.debug(
            `Retrying step (attempt ${attempt + 1}): ${stepDesc}`,
          );
          await this.delay(this.config.retryDelay);
        }

        result = await this.performAction(step);

        if (result.success) {
          // Capture AFTER screenshot (page state after successful step)
          const screenshotAfter = await this.captureScreenshot();

          const event: StepEvent = {
            timestamp: startTime,
            type: step.type,
            targetRef: this.stepTarget(step),
            value: "value" in step ? step.value : undefined,
            result: "success",
            duration: Date.now() - startTime,
            selector: result.selector,
            screenshotBefore,
            screenshot: screenshotAfter,
            network: [],
          };
          this.logger.stepCompleted(event);
          return event;
        }

        lastError = new Error(result.error ?? "Unknown error");
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    // Try auto-healing if standard retries failed
    if (
      lastError &&
      this.config.autoHeal &&
      step.type !== "navigate" &&
      step.type !== "wait" &&
      "locator" in step &&
      step.locator &&
      this.page
    ) {
      try {
        const accessibilityTree = await (this.page as any).accessibility?.snapshot?.();
        const screenshot = await this.captureScreenshot();
        const accessibilityTreeText = accessibilityTree
          ? JSON.stringify(accessibilityTree, null, 2)
          : "Accessibility snapshot unavailable in this Playwright runtime.";
        
        const context: HealingContext = {
          stepType: step.type,
          locator: step.locator,
          accessibilityTree: accessibilityTreeText,
          screenshotBase64: screenshot,
          errorMessage: lastError.message,
        };

        const healingResult = await this.autoHealer.heal(context);

        if (healingResult.locator) {
          this.logger.warn(`Self-healed locator for ${describeLocator(step.locator)}. New locator: ${describeLocator(healingResult.locator)}. Reasoning: ${healingResult.reasoning}`);
          
          const healedStep = { ...step, locator: healingResult.locator } as Step;
          result = await this.performAction(healedStep);

          if (result.success) {
            const screenshotAfter = await this.captureScreenshot();
            const event: StepEvent = {
              timestamp: startTime,
              type: step.type,
              targetRef: this.stepTarget(healedStep),
              value: "value" in step ? step.value : undefined,
              result: "success",
              duration: Date.now() - startTime,
              selector: result.selector,
              screenshotBefore,
              screenshot: screenshotAfter,
              network: [],
            };
            this.logger.stepCompleted(event);
            return event;
          }
        }
      } catch (healingError) {
        this.logger.debug(`Auto-healing failed: ${healingError}`);
      }
    }

    // All retries exhausted — capture failure diagnostics (includes after screenshot)
    const failureDiagnostics = await this.captureFailureDiagnostics();
    const locatorDiagnostics = await this.inspectFailedLocator(step);

    const event: StepEvent = {
      timestamp: startTime,
      type: step.type,
      targetRef: this.stepTarget(step),
      value: "value" in step ? step.value : undefined,
      result: "failed",
      duration: Date.now() - startTime,
      selector: result?.selector ?? this.stepTarget(step),
      screenshotBefore,
      screenshot: failureDiagnostics.screenshot,
      error: lastError?.message ?? "Unknown error",
      errorDetails: locatorDiagnostics ? { locatorDiagnostics } : undefined,
      network: [],
    };

    this.logger.stepCompleted(event);
    return event;
  }

  /**
   * Capture a screenshot of the current page state. Returns base64 PNG or undefined.
   */
  private async captureScreenshot(): Promise<string | undefined> {
    if (!this.page) return undefined;
    try {
      const buffer = await this.page.screenshot({ type: "png" });
      return buffer.toString("base64");
    } catch {
      return undefined;
    }
  }

  // ─── Execute all steps in a contract ─────────────────────────────────────

  async executeAll(steps: Step[]): Promise<StepEvent[]> {
    const results: StepEvent[] = [];

    for (const step of steps) {
      const event = await this.execute(step);
      results.push(event);

      // Stop execution on failure (fail-fast)
      if (event.result === "failed") {
        // Mark remaining steps as skipped
        const remaining = steps.slice(results.length);
        for (const skipped of remaining) {
          results.push({
            timestamp: Date.now(),
            type: skipped.type,
            targetRef: this.stepTarget(skipped),
            result: "skipped",
            duration: 0,
            network: [],
          });
        }
        break;
      }
    }

    return results;
  }

  // ─── Perform Individual Actions ──────────────────────────────────────────

  private async performAction(step: Step): Promise<ActionResult> {
    const page = this.getPage();
    const start = Date.now();

    switch (step.type) {
      case "navigate": {
        // Phase 3.11 — expand runtime-env placeholders in the navigation
        // URL (e.g. `/loan-accounts/{{QA_ACCOUNT_ID}}`) BEFORE joining
        // with baseUrl, otherwise the literal `{{…}}` ends up URL-encoded
        // and the route resolves to a 400.
        const url = this.resolveUrl(expandStepValue(step.url));
        await page.goto(url, {
          timeout: this.config.timeout,
          waitUntil: "domcontentloaded",
        });
        return { success: true, duration: Date.now() - start };
      }

      case "click": {
        const locator = resolveLocator(page, step.locator);
        await locator.click({ timeout: this.config.timeout });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      case "type": {
        const locator = resolveLocator(page, step.locator);
        const value = expandStepValue(step.value);
        await locator.fill(value, { timeout: this.config.timeout });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      case "select": {
        const locator = resolveLocator(page, step.locator);
        const value = expandStepValue(step.value);
        await locator.selectOption(value, {
          timeout: this.config.timeout,
        });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      case "wait": {
        const timeout = step.timeout ?? this.config.timeout;
        if (step.locator) {
          const locator = resolveLocator(page, step.locator);
          await locator.waitFor({ timeout, state: "visible" });
          return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
        }
        await page.waitForTimeout(timeout);
        return { success: true, duration: Date.now() - start };
      }

      case "request": {
        // Expand placeholders in the request URL for symmetry with `navigate`.
        const url = this.resolveUrl(expandStepValue(step.url));
        const method = step.method;
        const requestHeaders: Record<string, string> = {
          "X-Request-Id": this.logger.getTraceId(),
          ...step.headers,
        };

        // Parse body if provided (RequestStep.body is string; expand runtime {{ENV}} placeholders)
        let bodyData: string | undefined;
        if (step.body) {
          bodyData = expandStepValue(step.body);
          // Set content-type if not already set and body looks like JSON
          if (
            !requestHeaders["content-type"] &&
            !requestHeaders["Content-Type"]
          ) {
            try {
              JSON.parse(bodyData);
              requestHeaders["content-type"] = "application/json";
            } catch {
              // Not JSON, leave content-type unset
            }
          }
        }

        // Use Playwright's API request context (no browser page needed)
        const context = this.context!;
        const apiContext = context.request;

        const response = await apiContext.fetch(url, {
          method,
          headers: requestHeaders,
          data: bodyData,
          timeout: this.config.timeout,
        });

        // Capture response data
        const responseStatus = response.status();
        const responseHeaders = response.headers();
        let responseBody: unknown;
        try {
          const contentType = responseHeaders["content-type"] ?? "";
          if (contentType.includes("application/json")) {
            responseBody = await response.json();
          } else {
            responseBody = await response.text();
          }
        } catch {
          // Response body may not be readable
        }

        // Inject into network log so assertion engine can find it
        this.logger.logNetwork({
          method,
          url,
          status: responseStatus,
          requestHeaders,
          responseHeaders,
          requestBody:
            bodyData !== undefined ? tryParseJSONSafe(bodyData) : undefined,
          responseBody,
        });

        return { success: true, duration: Date.now() - start };
      }

      case "check": {
        const locator = resolveLocator(page, step.locator);
        await locator.check({ timeout: this.config.timeout });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      case "uncheck": {
        const locator = resolveLocator(page, step.locator);
        await locator.uncheck({ timeout: this.config.timeout });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      case "toggle": {
        const locator = resolveLocator(page, step.locator);
        await locator.click({ timeout: this.config.timeout });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      case "upload": {
        const locator = resolveLocator(page, step.locator);
        await locator.setInputFiles(expandStepValue(step.value), {
          timeout: this.config.timeout,
        });
        return { success: true, duration: Date.now() - start, selector: describeLocator(step.locator) };
      }

      default: {
        const _exhaustive: never = step;
        throw new Error(`Unknown step type: ${(_exhaustive as Step).type}`);
      }
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private resolveUrl(url: string): string {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }
    if (this.config.baseUrl) {
      return `${this.config.baseUrl.replace(/\/$/, "")}${url}`;
    }
    return url;
  }

  private describeStep(step: Step): string {
    switch (step.type) {
      case "navigate":
        return `navigate to ${step.url}`;
      case "click":
        return `click ${describeLocator(step.locator)}`;
      case "type":
        return `type "${step.value}" into ${describeLocator(step.locator)}`;
      case "select":
        return `select "${step.value}" in ${describeLocator(step.locator)}`;
      case "wait":
        return step.locator
          ? `wait for ${describeLocator(step.locator)}`
          : `wait ${step.timeout ?? "default"}ms`;
      case "request":
        return `${step.method} ${step.url}`;
      case "check":
        return `check ${describeLocator(step.locator)}`;
      case "uncheck":
        return `uncheck ${describeLocator(step.locator)}`;
      case "toggle":
        return `toggle ${describeLocator(step.locator)}`;
      case "upload":
        return `upload "${step.value}" into ${describeLocator(step.locator)}`;
    }
  }

  private stepTarget(step: Step): string | undefined {
    return "locator" in step && step.locator ? describeLocator(step.locator) : undefined;
  }

  private async captureFailureDiagnostics(): Promise<{
    screenshot?: string;
    dom?: string;
  }> {
    const result: { screenshot?: string; dom?: string } = {};

    if (!this.page) return result;

    try {
      if (this.config.screenshotOnFailure) {
        const buffer = await this.page.screenshot({ type: "png" });
        result.screenshot = buffer.toString("base64");
      }
    } catch {
      this.logger.warn("Failed to capture screenshot");
    }

    try {
      if (this.config.domOnFailure) {
        result.dom = await this.page.content();
      }
    } catch {
      this.logger.warn("Failed to capture DOM");
    }

    return result;
  }

  private async inspectFailedLocator(step: Step): Promise<unknown | undefined> {
    if (!this.page || !("locator" in step) || !step.locator) return undefined;

    try {
      return await inspectLocator(this.page, step.locator);
    } catch (err) {
      return {
        selector: describeLocator(step.locator),
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ─── Module Helpers ──────────────────────────────────────────────────────────

function tryParseJSONSafe(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}
