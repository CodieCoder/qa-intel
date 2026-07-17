import type { z } from "zod";

export type CapabilityKind = "step" | "assertion";
export type CapabilityResultDomain = "ui" | "api" | "business";
export type CapabilityFailureLayer = "ui" | "api" | "business";

export interface CapabilityParserMetadata {
  precedence: number;
  collisionKeys: readonly string[];
  parse?: (text: string) => CapabilityParseMatch | null;
}

export interface CapabilityParseMatch {
  value: unknown;
  kind?: string;
}

export interface CapabilityDependency {
  key: string;
  optional?: boolean;
}

export interface CapabilityExecutionRequest<TInput = unknown> {
  input: TInput;
  context: object;
  dependencies: Readonly<Record<string, unknown>>;
}

export interface CapabilityDefinition<TInput = unknown> {
  id: string;
  kind: CapabilityKind;
  discriminator: string;
  inputSchema: z.ZodType<TInput>;
  parser?: CapabilityParserMetadata;
  resultDomain: CapabilityResultDomain;
  failureLayer: CapabilityFailureLayer;
  artifacts: readonly string[];
  dependencies: readonly CapabilityDependency[];
  execute(request: CapabilityExecutionRequest<TInput>): Promise<unknown>;
}

export interface CapabilityFailure {
  capabilityId: string;
  layer: CapabilityFailureLayer;
  type: "not_found" | "invalid_input" | "missing_dependency" | "execution";
  message: string;
  details?: Record<string, unknown>;
}

export type CapabilityExecutionResult =
  | { ok: true; data: unknown }
  | { ok: false; failure: CapabilityFailure };
