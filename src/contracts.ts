import type express from "express";

/**
 * Interface for our web application.
 *
 * Why have this?
 * - It makes the boundary between "the app" and "the server" explicit.
 * - It makes testing easier (tests can depend on the interface).
 */
export interface IApp {
  /** Return the Express app instance (used by the HTTP server and tests). */
  getExpressApp(): express.Express;
}

/**
 * Interface for a server process that can listen on a port.
 *
 * This is intentionally tiny: it is the "runtime" boundary.
 */
export interface IServer {
  start(port: number): void;
}
