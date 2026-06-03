import { ActionEngine } from "../action-engine.js";
import { TestLogger } from "../../logger/index.js";

// A singleton to manage stateful browser sessions per traceId.
export class EngineManager {
  private static instances = new Map<string, ActionEngine>();

  /**
   * Gets an existing ActionEngine for the given traceId, or creates and launches a new one.
   */
  static async getOrCreate(
    traceId: string,
    logger: TestLogger
  ): Promise<ActionEngine> {
    const existing = this.instances.get(traceId);
    if (existing) {
      return existing;
    }

    const engine = new ActionEngine(logger);
    await engine.launch();
    this.instances.set(traceId, engine);
    
    return engine;
  }

  /**
   * Closes and removes the given traceId's engine.
   */
  static async close(traceId: string): Promise<void> {
    const engine = this.instances.get(traceId);
    if (engine) {
      await engine.close();
      this.instances.delete(traceId);
    }
  }

  /**
   * Gets an existing engine without throwing or auto-creating.
   */
  static get(traceId: string): ActionEngine | undefined {
    return this.instances.get(traceId);
  }
}
