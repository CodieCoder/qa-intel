import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repoRoot = new URL("..", import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);
const exampleHtml = readFileSync(
  new URL("../examples/test-app.html", import.meta.url),
  "utf-8",
);
const cliPath = join(repoRootPath, "dist", "cli.js");
const featurePath = join(repoRootPath, "examples", "login.feature");

const server = createServer((req, res) => {
  const origin = `http://${req.headers.host}`;
  const url = new URL(req.url ?? "/", origin);

  if (req.method === "GET" && ["/", "/login", "/dashboard"].includes(url.pathname)) {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(exampleHtml);
    return;
  }

  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end(`No route for ${req.method ?? "GET"} ${url.pathname}`);
});

let child;

server.on("error", (error) => {
  process.stderr.write(
    `Failed to start the bundled example server: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (!address || typeof address !== "object") {
    process.stderr.write("Failed to determine example server address.\n");
    process.exit(1);
    return;
  }

  const baseUrl = `http://127.0.0.1:${address.port}`;
  const cliArgs = [cliPath, featurePath, "--base-url", baseUrl, ...process.argv.slice(2)];

  child = spawn(process.execPath, cliArgs, {
    stdio: "inherit",
  });

  child.on("exit", (code, signal) => {
    server.close(() => {
      if (signal) {
        process.kill(process.pid, signal);
        return;
      }

      process.exit(code ?? 1);
    });
  });
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child?.kill(signal);
    server.close(() => {
      process.exit(1);
    });
  });
}
