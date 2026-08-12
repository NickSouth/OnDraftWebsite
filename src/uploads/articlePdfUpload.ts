import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import multer from "multer";

export const ARTICLE_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const ARTICLE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ARTICLE_HTML_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const ARTICLE_HTML_VIDEO_MAX_BYTES = 100 * 1024 * 1024;
export const ARTICLE_UPLOAD_PUBLIC_PATH = "/uploads/articles";
export const ARTICLE_UPLOAD_DIRECTORY = path.join(process.cwd(), "public", "uploads", "articles");
// Videos stream to disk rather than through memory, so they need a scratch directory.
// It must stay outside public/ (express.static would serve a half-written upload) while
// remaining on the same filesystem as the asset store, which renames files out of it.
export const ARTICLE_HTML_VIDEO_TEMP_DIRECTORY = path.join(process.cwd(), "tmp", "article-video-uploads");

fs.mkdirSync(ARTICLE_UPLOAD_DIRECTORY, { recursive: true });

const allowedImageMimeTypes = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/gif", ".gif"],
  ["image/webp", ".webp"],
]);

const allowedVideoMimeTypes = new Map([
  ["video/mp4", ".mp4"],
  ["video/webm", ".webm"],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ARTICLE_UPLOAD_DIRECTORY);
  },
  filename: (_req, file, cb) => {
    const parsed = path.parse(file.originalname);
    const extension = file.fieldname === "pdf"
      ? ".pdf"
      : allowedImageMimeTypes.get(file.mimetype) ?? parsed.ext.toLowerCase();
    const safeBase = parsed.name
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 36) || "article";
    cb(null, `${Date.now()}-${randomUUID()}-${safeBase}${extension}`);
  },
});

export const articleUpload = multer({
  storage,
  limits: {
    fileSize: ARTICLE_PDF_MAX_BYTES,
    fieldSize: 100 * 1024,
    fields: 40,
    files: 2,
    parts: 45,
  },
  fileFilter: (_req, file, cb) => {
    if (file.fieldname === "pdf") {
      const hasPdfMime = file.mimetype === "application/pdf";
      const hasPdfExtension = path.extname(file.originalname).toLowerCase() === ".pdf";

      if (!hasPdfMime || !hasPdfExtension) {
        cb(new Error("Only PDF files can be uploaded for PDF articles."));
        return;
      }

      cb(null, true);
      return;
    }

    if (file.fieldname === "image") {
      if (!allowedImageMimeTypes.has(file.mimetype)) {
        cb(new Error("Only JPG, PNG, GIF, or WebP files can be uploaded for article images."));
        return;
      }

      cb(null, true);
      return;
    }

    cb(new Error("Unexpected article upload field."));
  },
});

export const articleHtmlImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ARTICLE_HTML_IMAGE_MAX_BYTES,
    files: 1,
    fields: 2,
    parts: 4,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedImageMimeTypes.has(file.mimetype)) {
      cb(new Error("Only JPG, PNG, GIF, or WebP files can be uploaded for HTML article images."));
      return;
    }

    cb(null, true);
  },
});

export const articleHtmlVideoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      fs.mkdirSync(ARTICLE_HTML_VIDEO_TEMP_DIRECTORY, { recursive: true });
      cb(null, ARTICLE_HTML_VIDEO_TEMP_DIRECTORY);
    },
    filename: (_req, _file, cb) => {
      cb(null, `${Date.now()}-${randomUUID()}.upload`);
    },
  }),
  limits: {
    fileSize: ARTICLE_HTML_VIDEO_MAX_BYTES,
    files: 1,
    fields: 2,
    parts: 4,
  },
  fileFilter: (_req, file, cb) => {
    if (!allowedVideoMimeTypes.has(file.mimetype)) {
      cb(new Error("Only MP4 or WebM files can be uploaded for HTML article videos."));
      return;
    }

    cb(null, true);
  },
});

export function articleImageExtensionForMimeType(mimeType: string): string | undefined {
  return allowedImageMimeTypes.get(mimeType);
}

export function articleVideoExtensionForMimeType(mimeType: string): string | undefined {
  return allowedVideoMimeTypes.get(mimeType);
}

export function publicArticleUploadUrl(filename: string): string {
  return `${ARTICLE_UPLOAD_PUBLIC_PATH}/${encodeURIComponent(filename)}`;
}
