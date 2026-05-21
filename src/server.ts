import "dotenv/config";
import type { IApp, IServer } from "./contracts";
import { createComposedApp } from "./composition";
import { loadAppConfig } from "./config/AppConfig";

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
const app = createComposedApp(config.repositoryMode, undefined, config);
const server = new HttpServer(app);

server.start(config.port);
