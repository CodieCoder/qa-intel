import type {
  CapabilityDefinition,
  CapabilityExecutionResult,
  CapabilityKind,
} from "./types.js";

/** Immutable registry for validated internal capability definitions. */
export class CapabilityRegistry {
  readonly #definitions: readonly CapabilityDefinition[];
  readonly #byId: ReadonlyMap<string, CapabilityDefinition>;

  constructor(definitions: readonly CapabilityDefinition[]) {
    validateDefinitions(definitions);

    const frozen = definitions.map(freezeDefinition);
    this.#definitions = Object.freeze(frozen);
    this.#byId = new Map(frozen.map((definition) => [definition.id, definition]));
  }

  get(id: string): CapabilityDefinition | undefined {
    return this.#byId.get(id);
  }

  find(kind: CapabilityKind, discriminator: string): CapabilityDefinition | undefined {
    return this.#definitions.find(
      (definition) =>
        definition.kind === kind && definition.discriminator === discriminator,
    );
  }

  list(kind?: CapabilityKind): readonly CapabilityDefinition[] {
    const definitions = kind
      ? this.#definitions.filter((definition) => definition.kind === kind)
      : [...this.#definitions];
    return Object.freeze(definitions);
  }

  parsers(kind: CapabilityKind): readonly CapabilityDefinition[] {
    const definitions = this.#definitions
      .filter((definition) => definition.kind === kind && definition.parser)
      .sort((a, b) => {
        const order = a.parser!.precedence - b.parser!.precedence;
        return order || a.id.localeCompare(b.id);
      });
    return Object.freeze(definitions);
  }

  async execute(
    id: string,
    input: unknown,
    context: object,
    dependencies: Readonly<Record<string, unknown>> = {},
  ): Promise<CapabilityExecutionResult> {
    const definition = this.#byId.get(id);
    if (!definition) {
      return {
        ok: false,
        failure: {
          capabilityId: id,
          layer: "business",
          type: "not_found",
          message: `Capability not found: ${id}`,
        },
      };
    }

    const parsed = definition.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        failure: {
          capabilityId: id,
          layer: definition.failureLayer,
          type: "invalid_input",
          message: `Invalid input for capability ${id}`,
          details: { issues: parsed.error.issues },
        },
      };
    }

    const declaredDependencies: Record<string, unknown> = {};
    for (const dependency of definition.dependencies) {
      if (!(dependency.key in dependencies)) {
        if (dependency.optional) continue;
        return {
          ok: false,
          failure: {
            capabilityId: id,
            layer: definition.failureLayer,
            type: "missing_dependency",
            message: `Missing dependency "${dependency.key}" for capability ${id}`,
          },
        };
      }
      declaredDependencies[dependency.key] = dependencies[dependency.key];
    }

    try {
      const data = await definition.execute({
        input: parsed.data,
        context,
        dependencies: Object.freeze(declaredDependencies),
      });
      return { ok: true, data };
    } catch (error) {
      return {
        ok: false,
        failure: {
          capabilityId: id,
          layer: definition.failureLayer,
          type: "execution",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }
}

function validateDefinitions(definitions: readonly CapabilityDefinition[]): void {
  const identifiers = new Set<string>();
  const discriminators = new Set<string>();
  const precedences = new Set<string>();
  const collisionKeys = new Map<string, string>();

  for (const definition of definitions) {
    if (identifiers.has(definition.id)) {
      throw new Error(`Duplicate capability identifier: ${definition.id}`);
    }
    identifiers.add(definition.id);

    const discriminatorKey = `${definition.kind}:${definition.discriminator}`;
    if (discriminators.has(discriminatorKey)) {
      throw new Error(
        `Duplicate ${definition.kind} discriminator: ${definition.discriminator}`,
      );
    }
    discriminators.add(discriminatorKey);

    if (!definition.parser) continue;

    const precedenceKey = `${definition.kind}:${definition.parser.precedence}`;
    if (precedences.has(precedenceKey)) {
      throw new Error(
        `Duplicate ${definition.kind} parser precedence: ${definition.parser.precedence}`,
      );
    }
    precedences.add(precedenceKey);

    for (const key of definition.parser.collisionKeys) {
      const collisionKey = `${definition.kind}:${key}`;
      const owner = collisionKeys.get(collisionKey);
      if (owner) {
        throw new Error(
          `Parser collision key "${key}" is declared by ${owner} and ${definition.id}`,
        );
      }
      collisionKeys.set(collisionKey, definition.id);
    }
  }
}

function freezeDefinition(
  definition: CapabilityDefinition,
): CapabilityDefinition {
  const parser = definition.parser
    ? Object.freeze({
        ...definition.parser,
        collisionKeys: Object.freeze([...definition.parser.collisionKeys]),
      })
    : undefined;

  return Object.freeze({
    ...definition,
    parser,
    artifacts: Object.freeze([...definition.artifacts]),
    dependencies: Object.freeze(
      definition.dependencies.map((dependency) => Object.freeze({ ...dependency })),
    ),
  });
}
