import fs from "node:fs/promises";
import path from "node:path";

export class InvalidArticleHtmlAssetKeyError extends Error {
  constructor(key: string) {
    super(`Invalid HTML article asset key "${key}".`);
  }
}

/**
 * Content-addressed storage for assets embedded in HTML articles.
 *
 * These are author uploads referenced by published articles, not a regenerable
 * cache, so nothing here evicts on age — a file only leaves when the author's
 * article stops pointing at it.
 */
export class ArticleHtmlAssetStore {
  private readonly directory: string;

  constructor(directory: string, private readonly keyPattern: RegExp) {
    this.directory = path.resolve(directory);
  }

  async ensureDirectory(): Promise<void> {
    await fs.mkdir(this.directory, { recursive: true });
  }

  normalizedKey(key: string): string {
    const normalized = key.trim().toLowerCase();
    if (!this.keyPattern.test(normalized)) {
      throw new InvalidArticleHtmlAssetKeyError(key);
    }
    return normalized;
  }

  // Every path used for reads or writes goes through here, so a key that would
  // resolve outside the asset directory can never reach the filesystem.
  pathForKey(key: string): string {
    const filePath = path.resolve(this.directory, key);
    if (path.dirname(filePath) !== this.directory) {
      throw new InvalidArticleHtmlAssetKeyError(key);
    }
    return filePath;
  }

  async existingPathForKey(key: string): Promise<string> {
    await this.ensureDirectory();
    const filePath = this.pathForKey(this.normalizedKey(key));
    await fs.access(filePath);
    return filePath;
  }

  contentAddressedKey(hash: string, originalName: string, extension: string, fallbackName: string): string {
    return this.normalizedKey(`${hash}-${this.safeBaseName(originalName, fallbackName)}${extension}`);
  }

  tempPathForKey(key: string): string {
    return this.pathForKey(`${key}.${process.pid}.${Date.now()}.tmp`);
  }

  // Moves a finished upload into place. A rename collision means another upload
  // already stored identical bytes, so the existing file is the correct result.
  async commit(tempPath: string, key: string): Promise<void> {
    const filePath = this.pathForKey(key);
    try {
      await fs.rename(tempPath, filePath);
    } catch {
      await fs.rm(tempPath, { force: true });
      await fs.access(filePath);
    }
  }

  private safeBaseName(originalName: string, fallbackName: string): string {
    return path.parse(originalName).name
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 36) || fallbackName;
  }
}
