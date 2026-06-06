import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { articleImageExtensionForMimeType } from "../uploads/articlePdfUpload";

const ARTICLE_HTML_IMAGE_CACHE_VERSION = "v1";
const CACHE_MAX_UNUSED_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const IMAGE_KEY_PATTERN = /^[0-9a-f]{16}-[a-z0-9-]{1,36}\.(jpg|png|gif|webp)$/;

export class InvalidArticleHtmlImageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid HTML article image key "${key}".`);
  }
}

export interface StoredArticleHtmlImage {
  key: string;
  url: string;
  originalName: string;
  size: number;
}

export interface IArticleHtmlImageAssetService {
  cacheControlHeader(): string;
  generatedImagePath(key: string): Promise<string>;
  storeUploadedImage(file: Express.Multer.File): Promise<StoredArticleHtmlImage>;
}

export class ArticleHtmlImageAssetService implements IArticleHtmlImageAssetService {
  private readonly cacheDirectory = path.resolve(process.cwd(), "public", "generated", "article-images", ARTICLE_HTML_IMAGE_CACHE_VERSION);
  private lastCleanupAt = 0;

  cacheControlHeader(): string {
    return "public, max-age=31536000, immutable";
  }

  async generatedImagePath(key: string): Promise<string> {
    const normalizedKey = this.normalizedKey(key);
    await this.ensureCacheDirectory();
    this.cleanupOldGeneratedImages().catch(() => undefined);
    const filePath = this.filePathForKey(normalizedKey);
    await fs.access(filePath);
    return filePath;
  }

  async storeUploadedImage(file: Express.Multer.File): Promise<StoredArticleHtmlImage> {
    const extension = articleImageExtensionForMimeType(file.mimetype);
    if (!extension) {
      throw new InvalidArticleHtmlImageKeyError(file.originalname);
    }

    await this.ensureCacheDirectory();
    this.cleanupOldGeneratedImages().catch(() => undefined);

    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex").slice(0, 16);
    const key = this.normalizedKey(`${hash}-${this.safeBaseName(file.originalname)}${extension}`);
    const filePath = this.filePathForKey(key);
    const tempPath = path.resolve(this.cacheDirectory, `${key}.${process.pid}.${Date.now()}.tmp`);
    if (path.dirname(tempPath) !== this.cacheDirectory) {
      throw new InvalidArticleHtmlImageKeyError(key);
    }

    await fs.writeFile(tempPath, file.buffer);
    try {
      await fs.rename(tempPath, filePath);
    } catch (error) {
      await fs.rm(tempPath, { force: true });
      await fs.access(filePath);
    }

    return {
      key,
      url: `/generated/article-images/${ARTICLE_HTML_IMAGE_CACHE_VERSION}/${key}`,
      originalName: file.originalname,
      size: file.size,
    };
  }

  private normalizedKey(key: string): string {
    const normalized = key.trim().toLowerCase();
    if (!IMAGE_KEY_PATTERN.test(normalized)) {
      throw new InvalidArticleHtmlImageKeyError(key);
    }
    return normalized;
  }

  private safeBaseName(originalName: string): string {
    return path.parse(originalName).name
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase()
      .slice(0, 36) || "article-image";
  }

  private filePathForKey(key: string): string {
    const filePath = path.resolve(this.cacheDirectory, key);
    if (path.dirname(filePath) !== this.cacheDirectory) {
      throw new InvalidArticleHtmlImageKeyError(key);
    }
    return filePath;
  }

  private async ensureCacheDirectory(): Promise<void> {
    await fs.mkdir(this.cacheDirectory, { recursive: true });
  }

  private async cleanupOldGeneratedImages(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) {
      return;
    }
    this.lastCleanupAt = now;

    let entries: string[];
    try {
      entries = await fs.readdir(this.cacheDirectory);
    } catch {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      if (!IMAGE_KEY_PATTERN.test(entry)) {
        return;
      }
      const filePath = path.resolve(this.cacheDirectory, entry);
      if (path.dirname(filePath) !== this.cacheDirectory) {
        return;
      }
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat || now - stat.mtimeMs < CACHE_MAX_UNUSED_AGE_MS) {
        return;
      }
      await fs.rm(filePath, { force: true });
    }));
  }
}

export function CreateArticleHtmlImageAssetService(): IArticleHtmlImageAssetService {
  return new ArticleHtmlImageAssetService();
}
