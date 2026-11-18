import http from "node:http";
import type { AddressInfo } from "node:net";
import request from "supertest";

describe("test server binding", () => {
  // If this fails after a Node upgrade, the setup file's handle helper is gone and requests can
  // once again be answered by another program listening on the same loopback port.
  it("binds supertest's servers to 127.0.0.1 rather than every interface", async () => {
    const server = http.createServer((_req, res) => {
      res.end((server.address() as AddressInfo).address);
    });

    const response = await request(server).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toBe("127.0.0.1");
    expect(server.listening).toBe(false);
  });
});
