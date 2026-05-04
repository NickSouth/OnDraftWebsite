import "dotenv/config";
import type { IApp, IServer } from "./contracts";
import { createComposedApp } from "./composition";

export class HttpServer implements IServer {
  constructor(private readonly app: IApp) {}

  start(port: number): void {
    const expressApp = this.app.getExpressApp();

    expressApp.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`CheeksCast website running on http://localhost:${port}`);
    });
  }
}

const mode = process.env.REPO_MODE === "prisma" ? "prisma" : "memory";
const port = Number(process.env.PORT ?? 3000);
const app = createComposedApp(mode);
const server = new HttpServer(app);

server.start(port);
