import fs from "node:fs";
import path from "node:path";
import multer from "multer";

export const ARTICLE_PDF_MAX_BYTES = 5 * 1024 * 1024;
export const ARTICLE_UPLOAD_PUBLIC_PATH = "/uploads/articles";
export const ARTICLE_UPLOAD_DIRECTORY = path.join(process.cwd(), "public", "uploads", "articles");

fs.mkdirSync(ARTICLE_UPLOAD_DIRECTORY, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, ARTICLE_UPLOAD_DIRECTORY);
  },
  filename: (_req, file, cb) => {
    const parsed = path.parse(file.originalname);
    const safeBase = parsed.name
      .replace(/[^a-zA-Z0-9-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80) || "article";
    cb(null, `${Date.now()}-${safeBase}.pdf`);
  },
});

export const articlePdfUpload = multer({
  storage,
  limits: {
    fileSize: ARTICLE_PDF_MAX_BYTES,
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    const hasPdfMime = file.mimetype === "application/pdf";
    const hasPdfExtension = path.extname(file.originalname).toLowerCase() === ".pdf";

    if (!hasPdfMime || !hasPdfExtension) {
      cb(new Error("Only PDF files can be uploaded for PDF articles."));
      return;
    }

    cb(null, true);
  },
});

export function publicArticlePdfUrl(filename: string): string {
  return `${ARTICLE_UPLOAD_PUBLIC_PATH}/${encodeURIComponent(filename)}`;
}
