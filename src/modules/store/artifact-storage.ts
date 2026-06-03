import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { existsSync } from 'node:fs';

export interface IArtifactStorage {
  /**
   * Save an artifact (screenshot, DOM snapshot, etc.)
   * @param traceId The run/trace identifier grouping these artifacts
   * @param filename The desired filename (e.g., "step-1-after.png")
   * @param base64Data The base64 encoded data to save
   * @returns The absolute file path to the saved artifact
   */
  saveArtifact(traceId: string, filename: string, base64Data: string): Promise<string>;

  /**
   * Retrieve an artifact's base64 data by absolute path or local:// URI.
   * @param pathOrUri The absolute file path or local:// URI
   * @returns The base64 encoded data, or null if not found
   */
  getArtifact(pathOrUri: string): Promise<string | null>;
}

/**
 * Local storage implementation for artifacts.
 * Saves files to the local `.qa-results/artifacts` directory.
 * All paths are resolved to absolute before storage and return.
 * Easily swappable for an S3ArtifactStorage provider later.
 */
export class LocalArtifactStorage implements IArtifactStorage {
  private basePath: string;

  constructor(basePath: string = '.qa-results/artifacts') {
    this.basePath = resolve(basePath);
  }

  async saveArtifact(traceId: string, filename: string, base64Data: string): Promise<string> {
    const dirPath = join(this.basePath, traceId);
    
    // Ensure the directory exists
    if (!existsSync(dirPath)) {
      await mkdir(dirPath, { recursive: true });
    }

    const filePath = join(dirPath, filename);
    const buffer = Buffer.from(base64Data, 'base64');
    
    await writeFile(filePath, buffer);

    // Return absolute file path (no more local:// URI)
    return filePath;
  }

  async getArtifact(pathOrUri: string): Promise<string | null> {
    // Accept both raw file paths and legacy local:// URIs
    let filePath = pathOrUri;
    if (filePath.startsWith('local://')) {
      filePath = filePath.replace('local://', '');
    }

    // Resolve to absolute if relative
    filePath = resolve(filePath);
    
    if (!existsSync(filePath)) {
      return null;
    }

    const buffer = await readFile(filePath);
    return buffer.toString('base64');
  }
}
