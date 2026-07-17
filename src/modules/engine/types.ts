import type { Page, Browser, BrowserContext } from "playwright";

export interface EngineConfig {
  /** Base URL prepended to navigate paths */
  baseUrl?: string;
  /** Default timeout for actions in milliseconds */
  timeout: number;
  /** Number of retries for failed actions */
  retries: number;
  /** Delay between retries in milliseconds */
  retryDelay: number;
  /** Capture screenshots on failure */
  screenshotOnFailure: boolean;
  /** Capture DOM snapshot on failure */
  domOnFailure: boolean;
  /** Headless browser mode */
  headless: boolean;
  /** Slow down actions by this many milliseconds (useful for demos) */
  slowMo: number;
  /** Viewport dimensions */
  viewport: { width: number; height: number };
  /** Enable experimental LLM locator healing after normal retries fail */
  autoHeal: boolean;
  /** Explicit browser executable path to pass to Playwright Chromium */
  browserExecutablePath?: string;
  /** Explicit Playwright Chromium channel, such as chrome or msedge */
  browserChannel?: string;
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  timeout: 10_000,
  retries: 2,
  retryDelay: 500,
  screenshotOnFailure: true,
  domOnFailure: true,
  headless: true,
  slowMo: 0,
  viewport: { width: 1280, height: 720 },
  autoHeal: false,
};

export interface EngineContext {
  browser: Browser;
  context: BrowserContext;
  page: Page;
}

export interface ActionResult {
  success: boolean;
  duration: number;
  error?: string;
  screenshot?: string;
  dom?: string;
  selector?: string;
}
