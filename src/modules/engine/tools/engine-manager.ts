import { ActionEngine } from "../action-engine.js";
import type { TestLogger } from "../../logger/index.js";

export interface EngineSession {
  launch(): Promise<void>;
  close(): Promise<void>;
}

export type EngineSessionFactory<TEngine extends EngineSession> = (
  logger: TestLogger,
) => TEngine;

/** Isolated trace-scoped engine state with an injected engine factory. */
export class EngineSessionRegistry<
  TEngine extends EngineSession = ActionEngine,
> {
  private readonly instances = new Map<string, TEngine>();

  constructor(private readonly createEngine: EngineSessionFactory<TEngine>) {}

  async getOrCreate(traceId: string, logger: TestLogger): Promise<TEngine> {
    const existing = this.instances.get(traceId);
    if (existing) return existing;

    const engine = this.createEngine(logger);
    await engine.launch();
    this.instances.set(traceId, engine);
    return engine;
  }

  async close(traceId: string): Promise<void> {
    const engine = this.instances.get(traceId);
    if (!engine) return;

    await engine.close();
    this.instances.delete(traceId);
  }

  get(traceId: string): TEngine | undefined {
    return this.instances.get(traceId);
  }
}

const defaultEngineSessions = new EngineSessionRegistry(
  (logger) => new ActionEngine(logger),
);

/** Public compatibility facade over the default isolated session service. */
export class EngineManager {
  /**
   * Gets an existing ActionEngine for the given traceId, or creates and launches a new one.
   */
  static async getOrCreate(
    traceId: string,
    logger: TestLogger
  ): Promise<ActionEngine> {
    return defaultEngineSessions.getOrCreate(traceId, logger);
  }

  /**
   * Closes and removes the given traceId's engine.
   */
  static async close(traceId: string): Promise<void> {
    await defaultEngineSessions.close(traceId);
  }

  /**
   * Gets an existing engine without throwing or auto-creating.
   */
  static get(traceId: string): ActionEngine | undefined {
    return defaultEngineSessions.get(traceId);
  }
}
