import net from "node:net";
import { Server as TlsServer } from "node:tls";

/**
 * Keeps supertest's requests from being answered by some other program on this machine.
 *
 * supertest starts a server per request with listen(0), which binds every interface, and then
 * connects to 127.0.0.1. The operating system hands out that port without checking whether
 * another program is already listening on the same number on 127.0.0.1 only, as editors and
 * other local tools do. When the numbers coincide the request goes to that program, and a test
 * fails at random with its 401 or 404. Binding the test server to 127.0.0.1 itself makes the
 * operating system pick a port nothing else holds there.
 *
 * supertest reads the port synchronously, and listen(port, host) is not synchronous, so the
 * socket is bound first through Node's internal handle helper. If a Node release drops that
 * helper, supertest's own behaviour is left in place.
 */
type ListeningApp = net.Server & { listen(options: { _handle: unknown }): net.Server };
type BoundHandle = object | number;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Test = require("supertest/lib/test") as { prototype: { serverAddress(app: ListeningApp, path: string): string; _server?: net.Server } };
const createServerHandle = (net as unknown as { _createServerHandle?: (address: string, port: number, addressType: number) => BoundHandle })._createServerHandle;

if (typeof createServerHandle === "function") {
  const original = Test.prototype.serverAddress;

  Test.prototype.serverAddress = function serverAddress(this: { _server?: net.Server }, app: ListeningApp, path: string): string {
    if (app.address()) {
      return original.call(this, app, path);
    }

    const handle = createServerHandle("127.0.0.1", 0, 4);
    if (typeof handle === "number") {
      return original.call(this, app, path);
    }

    this._server = app.listen({ _handle: handle });
    const { port } = app.address() as net.AddressInfo;
    return `${app instanceof TlsServer ? "https" : "http"}://127.0.0.1:${port}${path}`;
  };
}
