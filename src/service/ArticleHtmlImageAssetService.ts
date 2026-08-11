import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { articleImageExtensionForMimeType } from "../uploads/articlePdfUpload";
import { ArticleHtmlAssetStore, InvalidArticleHtmlAssetKeyError } from "./ArticleHtmlAssetStore";

const ARTICLE_HTML_IMAGE_CACHE_VERSION = "v1";
const IMAGE_KEY_PATTERN = /^[0-9a-f]{16}-[a-z0-9-]{1,36}\.(jpg|png|gif|webp)$/;

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
  private readonly store = new ArticleHtmlAssetStore(
    path.resolve(process.cwd(), "public", "generated", "article-images", ARTICLE_HTML_IMAGE_CACHE_VERSION),
    IMAGE_KEY_PATTERN,
  );

  cacheControlHeader(): string {
    return "public, max-age=31536000, immutable";
  }

  async generatedImagePath(key: string): Promise<string> {
    return this.store.existingPathForKey(key);
  }

  async storeUploadedImage(file: Express.Multer.File): Promise<StoredArticleHtmlImage> {
    const extension = articleImageExtensionForMimeType(file.mimetype);
    if (!extension) {
      throw new InvalidArticleHtmlAssetKeyError(file.originalname);
    }

    await this.store.ensureDirectory();
    const hash = crypto.createHash("sha256").update(file.buffer).digest("hex").slice(0, 16);
    const key = this.store.contentAddressedKey(hash, file.originalname, extension, "article-image");
    const tempPath = this.store.tempPathForKey(key);

    await fs.writeFile(tempPath, file.buffer);
    await this.store.commit(tempPath, key);

    return {
      key,
      url: `/generated/article-images/${ARTICLE_HTML_IMAGE_CACHE_VERSION}/${key}`,
      originalName: file.originalname,
      size: file.size,
    };
  }
}

export function CreateArticleHtmlImageAssetService(): IArticleHtmlImageAssetService {
  return new ArticleHtmlImageAssetService();
}
