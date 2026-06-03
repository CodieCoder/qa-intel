import type { ResolveAPIContractInput, ResolveAPIContractOutput } from "../../types/index.js";

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

// In-memory API contract registry, keyed by endpointRef
const apiContractRegistry = new Map<string, APIContract>();

/**
 * Load API contracts from a JSON map (e.g., from a suite payload).
 */
export function loadAPIContracts(contracts: Record<string, APIContract>): void {
  for (const [ref, contract] of Object.entries(contracts)) {
    apiContractRegistry.set(ref, contract);
  }
}

/**
 * Clear all loaded API contracts.
 */
export function clearAPIContracts(): void {
  apiContractRegistry.clear();
}

/**
 * Resolves an API contract by its logical endpoint reference.
 * Returns the HTTP method, path, and optional request/response schemas.
 */
export async function resolveAPIContractTool(
  input: ResolveAPIContractInput
): Promise<ResolveAPIContractOutput> {
  const ref = input.endpointRef;

  // Check the registry first
  const registered = apiContractRegistry.get(ref);
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

  // Attempt to infer from common naming conventions:
  // e.g., "GET /api/users" → method=GET, path=/api/users
  const httpMethodMatch = ref.match(/^(GET|POST|PUT|DELETE)\s+(.+)$/i);
  if (httpMethodMatch) {
    return {
      ok: true,
      data: {
        method: httpMethodMatch[1].toUpperCase() as "GET" | "POST" | "PUT" | "DELETE",
        path: httpMethodMatch[2],
      },
    };
  }

  // If the ref looks like a path, assume GET
  if (ref.startsWith("/")) {
    return {
      ok: true,
      data: {
        method: "GET",
        path: ref,
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "NOT_FOUND",
      message: `API contract not found: "${ref}". Load contracts via loadAPIContracts() or use format "METHOD /path".`,
    },
  };
}
