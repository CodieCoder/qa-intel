export {
  LocalArtifactStorage,
  type IArtifactStorage
} from "./artifact-storage.js";

export {
  ResultStore,
  type IResultStore,
  type ResultStoreOptions,
} from "./result-store.js";

// ConsoleLogEntry is canonically defined in logger; re-export for convenience
export type { ConsoleLogEntry } from "../logger/index.js";
