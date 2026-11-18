import fs from "node:fs";
import path from "node:path";

/**
 * Where author uploads are kept on disk.
 *
 * The app's own folders are replaced on every deploy, so anything written there is lost.
 * When the host mounts a persistent volume into this service, every upload folder moves
 * under that one mount: a service gets a single volume, and the video scratch folder has
 * to share a filesystem with the video store because finished uploads are moved by rename.
 */
export interface UploadStorage {
  /** The mounted volume uploads live on, or null when they are in the app's own folders. */
  persistentRoot: string | null;
  /** Article thumbnails and PDFs, served at /uploads/articles. */
  articleUploads: string;
  /** Images embedded in HTML articles; the asset service adds its version folder. */
  articleImages: string;
  /** Videos embedded in HTML articles; the asset service adds its version folder. */
  articleVideos: string;
  /** Scratch space for videos while they upload. */
  videoTemp: string;
  /** Why a configured volume is not being used, when it could not be written to. */
  problem: string | null;
}

type Environment = Record<string, string | undefined>;

function localStorage(cwd: string, problem: string | null = null): UploadStorage {
  return {
    persistentRoot: null,
    articleUploads: path.join(cwd, "public", "uploads", "articles"),
    articleImages: path.join(cwd, "public", "generated", "article-images"),
    articleVideos: path.join(cwd, "public", "generated", "article-videos"),
    // Outside public/ so express.static never serves a half-written upload.
    videoTemp: path.join(cwd, "tmp", "article-video-uploads"),
    problem,
  };
}

/**
 * UPLOAD_DATA_DIR wins when set; otherwise Railway's own variable for an attached volume is
 * used, so attaching a volume is enough on its own. With neither, uploads stay local.
 */
export function resolveUploadStorage(env: Environment = process.env, cwd: string = process.cwd()): UploadStorage {
  const configured = (env.UPLOAD_DATA_DIR ?? "").trim() || (env.RAILWAY_VOLUME_MOUNT_PATH ?? "").trim();
  if (!configured) {
    return localStorage(cwd);
  }

  const root = path.resolve(configured);
  return {
    persistentRoot: root,
    articleUploads: path.join(root, "uploads", "articles"),
    articleImages: path.join(root, "generated", "article-images"),
    articleVideos: path.join(root, "generated", "article-videos"),
    videoTemp: path.join(root, "tmp", "article-video-uploads"),
    problem: null,
  };
}

/**
 * Creates the upload folders. A volume that cannot be written to (wrong mount path, wrong
 * permissions) must not take the site down at boot, so the app falls back to its own folders
 * and reports why; uploads then behave as they did before the volume existed.
 */
export function prepareUploadStorage(env: Environment = process.env, cwd: string = process.cwd()): UploadStorage {
  const storage = resolveUploadStorage(env, cwd);
  if (!storage.persistentRoot) {
    fs.mkdirSync(storage.articleUploads, { recursive: true });
    return storage;
  }

  try {
    for (const directory of [storage.articleUploads, storage.articleImages, storage.articleVideos, storage.videoTemp]) {
      fs.mkdirSync(directory, { recursive: true });
      fs.accessSync(directory, fs.constants.W_OK);
    }
    return storage;
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    const fallback = localStorage(cwd, `The upload volume at ${storage.persistentRoot} is not writable (${reason}).`);
    fs.mkdirSync(fallback.articleUploads, { recursive: true });
    return fallback;
  }
}

export function describeUploadStorage(storage: UploadStorage): { level: "info" | "warn" | "error"; message: string } {
  if (storage.persistentRoot) {
    return { level: "info", message: `Uploads are stored on the persistent volume at ${storage.persistentRoot}.` };
  }
  if (storage.problem) {
    return {
      level: "error",
      message: `${storage.problem} Uploads are being written to the app's own folders and will be lost on the next deploy.`,
    };
  }
  return {
    level: "warn",
    message: "No upload volume is configured (RAILWAY_VOLUME_MOUNT_PATH or UPLOAD_DATA_DIR). Uploads are written to the app's own folders and will be lost on the next deploy.",
  };
}

export const UPLOAD_STORAGE = prepareUploadStorage();
