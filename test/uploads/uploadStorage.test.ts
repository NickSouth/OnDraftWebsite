import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describeUploadStorage, prepareUploadStorage, resolveUploadStorage } from "../../src/uploads/uploadStorage";

describe("upload storage", () => {
  const cwd = path.join(path.sep, "srv", "app");

  it("keeps uploads in the app's own folders when no volume is configured", () => {
    const storage = resolveUploadStorage({}, cwd);

    expect(storage.persistentRoot).toBeNull();
    expect(storage.articleUploads).toBe(path.join(cwd, "public", "uploads", "articles"));
    expect(storage.articleImages).toBe(path.join(cwd, "public", "generated", "article-images"));
    expect(storage.articleVideos).toBe(path.join(cwd, "public", "generated", "article-videos"));
    expect(storage.videoTemp).toBe(path.join(cwd, "tmp", "article-video-uploads"));
    expect(describeUploadStorage(storage).level).toBe("warn");
  });

  it("moves every upload folder, including the video scratch folder, under a Railway volume", () => {
    const storage = resolveUploadStorage({ RAILWAY_VOLUME_MOUNT_PATH: "/app/data" }, cwd);

    expect(storage.persistentRoot).toBe(path.resolve("/app/data"));
    for (const directory of [storage.articleUploads, storage.articleImages, storage.articleVideos, storage.videoTemp]) {
      expect(directory.startsWith(path.resolve("/app/data") + path.sep)).toBe(true);
    }
    expect(storage.articleUploads).toBe(path.resolve("/app/data", "uploads", "articles"));
    expect(describeUploadStorage(storage)).toEqual({
      level: "info",
      message: `Uploads are stored on the persistent volume at ${path.resolve("/app/data")}.`,
    });
  });

  it("prefers an explicit UPLOAD_DATA_DIR over the Railway volume path and ignores blank values", () => {
    expect(resolveUploadStorage({ UPLOAD_DATA_DIR: "/mnt/uploads", RAILWAY_VOLUME_MOUNT_PATH: "/app/data" }, cwd).persistentRoot)
      .toBe(path.resolve("/mnt/uploads"));
    expect(resolveUploadStorage({ UPLOAD_DATA_DIR: "   ", RAILWAY_VOLUME_MOUNT_PATH: "" }, cwd).persistentRoot).toBeNull();
  });

  describe("on disk", () => {
    let scratch: string;

    beforeEach(() => {
      scratch = fs.mkdtempSync(path.join(os.tmpdir(), "ondraft-upload-storage-"));
    });

    afterEach(() => {
      fs.rmSync(scratch, { recursive: true, force: true });
    });

    it("creates the upload folders on a writable volume", () => {
      const volume = path.join(scratch, "volume");
      const storage = prepareUploadStorage({ UPLOAD_DATA_DIR: volume }, path.join(scratch, "app"));

      expect(storage.persistentRoot).toBe(volume);
      expect(storage.problem).toBeNull();
      for (const directory of [storage.articleUploads, storage.articleImages, storage.articleVideos, storage.videoTemp]) {
        expect(fs.statSync(directory).isDirectory()).toBe(true);
      }
    });

    it("falls back to the app's own folders, and says why, when the volume cannot be written to", () => {
      // A file where the volume should be makes every folder under it impossible to create.
      const blocked = path.join(scratch, "not-a-directory");
      fs.writeFileSync(blocked, "");
      const appDirectory = path.join(scratch, "app");

      const storage = prepareUploadStorage({ UPLOAD_DATA_DIR: blocked }, appDirectory);

      expect(storage.persistentRoot).toBeNull();
      expect(storage.articleUploads).toBe(path.join(appDirectory, "public", "uploads", "articles"));
      expect(fs.statSync(storage.articleUploads).isDirectory()).toBe(true);
      expect(storage.problem).toContain(`The upload volume at ${blocked} is not writable`);
      const status = describeUploadStorage(storage);
      expect(status.level).toBe("error");
      expect(status.message).toContain("will be lost on the next deploy");
    });
  });
});
