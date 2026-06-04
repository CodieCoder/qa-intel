import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const REPO_ROOT = join(import.meta.dirname, "..");
export const CLI = join(REPO_ROOT, "dist", "cli.js");

export function createTempDir(prefix = "qa-runtime-") {
  const path = mkdtempSync(join(tmpdir(), prefix));
  return {
    path,
    file: (...parts) => join(path, ...parts),
    cleanup: () => rmSync(path, { recursive: true, force: true }),
  };
}

export function writeTempFile(dir, relativePath, contents) {
  const path = join(typeof dir === "string" ? dir : dir.path, relativePath);
  writeFileSync(path, contents);
  return path;
}

export async function startHttpServer(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", async () => {
      const body = Buffer.concat(chunks).toString("utf-8");
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url ?? "/", origin);
      const request = {
        method: req.method ?? "GET",
        url,
        path: url.pathname,
        headers: req.headers,
        body,
      };
      requests.push(request);

      try {
        await handler(request, res);
      } catch (error) {
        res.writeHead(500, { "content-type": "text/plain" });
        res.end(error instanceof Error ? error.stack : String(error));
      }
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = `http://127.0.0.1:${address.port}`;

  return {
    origin,
    requests,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

export function createRouteHandler(routes, { rewriteTo } = {}) {
  return async (request, res) => {
    const key = `${request.method} ${request.path}`;
    const route = routes[key] ?? routes[request.path] ?? routes[rewriteTo];

    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(`No route for ${key}`);
      return;
    }

    const response = typeof route === "function" ? await route(request) : route;
    const status = response.status ?? 200;
    const headers = response.headers ?? { "content-type": "text/html" };
    res.writeHead(status, headers);
    res.end(response.body ?? "");
  };
}

export function runJsonCli(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
      ...options,
    });

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (status, signal) => {
      let json;
      try {
        json = JSON.parse(stdout);
      } catch (error) {
        reject(
          new Error(`Expected CLI JSON stdout, got:\n${stdout}\nSTDERR:\n${stderr}`, {
            cause: error,
          }),
        );
        return;
      }

      resolve({ status, signal, stdout, stderr, json });
    });
  });
}

export function assertBase64Png(value, message = "expected base64 PNG") {
  assert.equal(typeof value, "string", message);
  const buffer = Buffer.from(value, "base64");
  assertPngBuffer(buffer, message);
  return buffer;
}

export function assertPngFile(path, message = "expected PNG file") {
  assert.equal(existsSync(path), true, `${message}: file exists`);
  assert.ok(statSync(path).size > 8, `${message}: file is not empty`);
  const buffer = readFileSync(path);
  assertPngBuffer(buffer, message);
  return buffer;
}

function assertPngBuffer(buffer, message) {
  assert.ok(Buffer.isBuffer(buffer), message);
  assert.deepEqual(
    [...buffer.subarray(0, 8)],
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    message,
  );
}
