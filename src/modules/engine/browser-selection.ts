import { existsSync, statSync } from "node:fs";

export const BROWSER_EXECUTABLE_PATH_ENV = "QA_INTEL_BROWSER_EXECUTABLE_PATH";
export const BROWSER_CHANNEL_ENV = "QA_INTEL_BROWSER_CHANNEL";

export type BrowserSelectionKind = "executablePath" | "channel" | "bundled";
export type BrowserSelectionSource = "config" | "env" | "default";

export interface BrowserSelectionConfig {
  browserExecutablePath?: string;
  browserChannel?: string;
}

export interface BrowserSelection {
  kind: BrowserSelectionKind;
  source: BrowserSelectionSource;
  executablePath?: string;
  channel?: string;
  launchOptions: {
    executablePath?: string;
    channel?: string;
  };
}

export interface BrowserLaunchFailureDetails {
  browserSelection: Omit<BrowserSelection, "launchOptions"> & {
    executablePathExists?: boolean;
    executablePathIsFile?: boolean;
  };
  setupHints: string[];
  cause: string;
}

export class BrowserLaunchError extends Error {
  readonly details: BrowserLaunchFailureDetails;

  constructor(message: string, details: BrowserLaunchFailureDetails) {
    super(message);
    this.name = "BrowserLaunchError";
    this.details = details;
  }
}

export function resolveBrowserSelection(
  config: BrowserSelectionConfig = {},
  env: NodeJS.ProcessEnv = process.env,
): BrowserSelection {
  const configExecutablePath = nonEmpty(config.browserExecutablePath);
  if (configExecutablePath) {
    return {
      kind: "executablePath",
      source: "config",
      executablePath: configExecutablePath,
      launchOptions: { executablePath: configExecutablePath },
    };
  }

  const configChannel = nonEmpty(config.browserChannel);
  if (configChannel) {
    return {
      kind: "channel",
      source: "config",
      channel: configChannel,
      launchOptions: { channel: configChannel },
    };
  }

  const envExecutablePath = nonEmpty(env[BROWSER_EXECUTABLE_PATH_ENV]);
  if (envExecutablePath) {
    return {
      kind: "executablePath",
      source: "env",
      executablePath: envExecutablePath,
      launchOptions: { executablePath: envExecutablePath },
    };
  }

  const envChannel = nonEmpty(env[BROWSER_CHANNEL_ENV]);
  if (envChannel) {
    return {
      kind: "channel",
      source: "env",
      channel: envChannel,
      launchOptions: { channel: envChannel },
    };
  }

  return {
    kind: "bundled",
    source: "default",
    launchOptions: {},
  };
}

export function browserSelectionDetails(
  selection: BrowserSelection,
): BrowserLaunchFailureDetails["browserSelection"] {
  const details: BrowserLaunchFailureDetails["browserSelection"] = {
    kind: selection.kind,
    source: selection.source,
  };

  if (selection.executablePath) {
    details.executablePath = selection.executablePath;
    try {
      details.executablePathExists = existsSync(selection.executablePath);
      details.executablePathIsFile = details.executablePathExists
        ? statSync(selection.executablePath).isFile()
        : false;
    } catch {
      details.executablePathExists = false;
      details.executablePathIsFile = false;
    }
  }

  if (selection.channel) {
    details.channel = selection.channel;
  }

  return details;
}

export function createBrowserLaunchError(
  cause: unknown,
  selection: BrowserSelection,
): BrowserLaunchError {
  const causeMessage = cause instanceof Error ? cause.message : String(cause);
  const selectionLabel =
    selection.kind === "executablePath"
      ? `executable path "${selection.executablePath}"`
      : selection.kind === "channel"
        ? `browser channel "${selection.channel}"`
        : "bundled Playwright Chromium";

  return new BrowserLaunchError(
    `Failed to launch ${selectionLabel}: ${causeMessage}`,
    {
      browserSelection: browserSelectionDetails(selection),
      setupHints: browserSetupHints(selection),
      cause: causeMessage,
    },
  );
}

function browserSetupHints(selection: BrowserSelection): string[] {
  if (selection.kind === "executablePath") {
    return [
      "Verify that the selected browser executable path exists and is executable.",
      "Pass --browser-channel instead if you want Playwright to resolve an installed Chrome or Edge channel.",
      "Omit browser selection flags and environment variables to use bundled Playwright Chromium.",
    ];
  }

  if (selection.kind === "channel") {
    return [
      "Verify that the requested browser channel is installed on this machine.",
      "Use --browser-executable-path with a known browser binary when channel resolution is unavailable.",
      "Omit browser selection flags and environment variables to use bundled Playwright Chromium.",
    ];
  }

  return [
    "Install Playwright browsers for this package if bundled Chromium is missing.",
    "Use --browser-executable-path or QA_INTEL_BROWSER_EXECUTABLE_PATH to point at an existing browser binary.",
  ];
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
