import "dotenv/config";
import type { IApp, IServer } from "./contracts";
import { createComposedApp } from "./composition";
import { loadAppConfig } from "./config/AppConfig";
import { CreateLoggingService } from "./service/LoggingService";
import { describeUploadStorage, UPLOAD_STORAGE } from "./uploads/uploadStorage";

export class HttpServer implements IServer {
  constructor(private readonly app: IApp) {}

  start(port: number): void {
    const expressApp = this.app.getExpressApp();

    expressApp.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`OnDraft running on http://localhost:${port}`);
    });
  }
}

const config = loadAppConfig();
// Says at boot whether uploads will survive the next deploy, so a missing or unwritable volume
// shows up in the deploy log instead of as vanished images later.
const uploadStorageStatus = describeUploadStorage(UPLOAD_STORAGE);
CreateLoggingService()[uploadStorageStatus.level](uploadStorageStatus.message);
const app = createComposedApp(config.repositoryMode, undefined, config);
const server = new HttpServer(app);

server.start(config.port);
