import type { ResolveAPIContractInput, ResolveAPIContractOutput } from "../../tools/schema.js";

/**
 * Registry of API contracts mapping logical endpoint names to HTTP details.
 * Agents can load contracts via the apiContracts field in suite payloads.
 */
export interface APIContract {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  requestSchema?: any;
  responseSchema?: any;
}

/** Isolated API-contract state for injected or scoped tool workflows. */
export class APIContractRegistry {
  private readonly contracts = new Map<string, APIContract>();

  load(contracts: Record<string, APIContract>): void {
    for (const [ref, contract] of Object.entries(contracts)) {
      this.contracts.set(ref, contract);
    }
  }

  clear(): void {
    this.contracts.clear();
  }

  async resolve(
    input: ResolveAPIContractInput,
  ): Promise<ResolveAPIContractOutput> {
    const ref = input.endpointRef;
    const registered = this.contracts.get(ref);
    if (registered) {
      return {
        ok: true,
        data: {
          method: registered.method,
          path: registered.path,
          requestSchema: registered.requestSchema,
          responseSchema: registered.responseSchema,
        },
      };
    }

    const httpMethodMatch = ref.match(/^(GET|POST|PUT|DELETE)\s+(.+)$/i);
    if (httpMethodMatch) {
      return {
        ok: true,
        data: {
          method: httpMethodMatch[1].toUpperCase() as APIContract["method"],
          path: httpMethodMatch[2],
        },
      };
    }

    if (ref.startsWith("/")) {
      return { ok: true, data: { method: "GET", path: ref } };
    }

    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: `API contract not found: "${ref}". Load contracts via loadAPIContracts() or use format "METHOD /path".`,
      },
    };
  }
}

const defaultAPIContracts = new APIContractRegistry();

/**
 * Load API contracts from a JSON map (e.g., from a suite payload).
 */
export function loadAPIContracts(contracts: Record<string, APIContract>): void {
  defaultAPIContracts.load(contracts);
}

/**
 * Clear all loaded API contracts.
 */
export function clearAPIContracts(): void {
  defaultAPIContracts.clear();
}

/**
 * Resolves an API contract by its logical endpoint reference.
 * Returns the HTTP method, path, and optional request/response schemas.
 */
export async function resolveAPIContractTool(
  input: ResolveAPIContractInput
): Promise<ResolveAPIContractOutput> {
  return defaultAPIContracts.resolve(input);
}
