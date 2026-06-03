import type { GetStepArtifactsInput, GetStepArtifactsOutput } from "../../types/index.js";
import { EngineManager } from "./engine-manager.js";
import { LocalArtifactStorage } from "../../store/index.js";

const storage = new LocalArtifactStorage();

export async function getStepArtifactsTool(
  input: GetStepArtifactsInput
): Promise<GetStepArtifactsOutput> {
  const engine = EngineManager.get(input.traceId);
  let domSnapshot: string | undefined;

  if (engine) {
    try {
      domSnapshot = await engine.getPage().content();
    } catch {}
  }

  // Accept both absolute file paths and legacy local:// URIs
  let screenshot: string | undefined;
  if (input.stepId) {
    const data = await storage.getArtifact(input.stepId);
    if (data) {
      screenshot = data;
    }
  }

  // Console logs are now captured per-step and stored in the DB.
  // For live engine queries, pull from the engine's in-memory buffer.
  let consoleLogs: string[] = [];
  if (engine && input.stepId) {
    const logs = engine.getConsoleLogsForStep(input.stepId);
    consoleLogs = logs.map((l) => `[${l.level}] ${l.message}`);
  }

  return {
    ok: true,
    data: {
      screenshot,
      domSnapshot,
      consoleLogs,
    },
  };
}
