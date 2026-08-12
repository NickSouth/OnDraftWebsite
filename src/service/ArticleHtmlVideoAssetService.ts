import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { articleVideoExtensionForMimeType } from "../uploads/articlePdfUpload";
import { ArticleHtmlAssetStore, InvalidArticleHtmlAssetKeyError } from "./ArticleHtmlAssetStore";

const ARTICLE_HTML_VIDEO_CACHE_VERSION = "v1";
const VIDEO_KEY_PATTERN = /^[0-9a-f]{16}-[a-z0-9-]{1,36}\.(mp4|webm)$/;

export interface StoredArticleHtmlVideo {
  key: string;
  url: string;
  originalName: string;
  size: number;
}

export interface IArticleHtmlVideoAssetService {
  cacheControlHeader(): string;
  generatedVideoPath(key: string): Promise<string>;
  storeUploadedVideo(file: Express.Multer.File): Promise<StoredArticleHtmlVideo>;
}

export class ArticleHtmlVideoAssetService implements IArticleHtmlVideoAssetService {
  private readonly store = new ArticleHtmlAssetStore(
    path.resolve(process.cwd(), "public", "generated", "article-videos", ARTICLE_HTML_VIDEO_CACHE_VERSION),
    VIDEO_KEY_PATTERN,
  );

  cacheControlHeader(): string {
    return "public, max-age=31536000, immutable";
  }

  async generatedVideoPath(key: string): Promise<string> {
    return this.store.existingPathForKey(key);
  }

  /**
   * Videos are far too large to hold in memory the way article images are, so
   * multer streams them to a temp file and the content hash is read back off
   * disk rather than computed from a buffer.
   */
  async storeUploadedVideo(file: Express.Multer.File): Promise<StoredArticleHtmlVideo> {
    const extension = articleVideoExtensionForMimeType(file.mimetype);
    if (!extension) {
      await fs.rm(file.path, { force: true });
      throw new InvalidArticleHtmlAssetKeyError(file.originalname);
    }

    try {
      await this.store.ensureDirectory();
      const hash = await this.hashFile(file.path);
      const key = this.store.contentAddressedKey(hash, file.originalname, extension, "article-video");
      await this.store.commit(file.path, key);

      return {
        key,
        url: `/generated/article-videos/${ARTICLE_HTML_VIDEO_CACHE_VERSION}/${key}`,
        originalName: file.originalname,
        size: file.size,
      };
    } finally {
      // commit() renames the temp file on success; this clears it on every failure path.
      await fs.rm(file.path, { force: true });
    }
  }

  private async hashFile(filePath: string): Promise<string> {
    const hash = crypto.createHash("sha256");
    await pipeline(createReadStream(filePath), hash);
    return hash.digest("hex").slice(0, 16);
  }
}

export function CreateArticleHtmlVideoAssetService(): IArticleHtmlVideoAssetService {
  return new ArticleHtmlVideoAssetService();
}
