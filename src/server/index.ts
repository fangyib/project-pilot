import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { findAppRoot } from "../executor/app-root.js";
import { pickFolder } from "./pick-folder.js";
import { createPilot } from "../service/pilot.js";
import { createFileStore } from "../store/database.js";
import { decryptSecret, encryptSecret, last4, loadMasterKey } from "../store/crypto.js";
import type { ModelPreference } from "../domain/types.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(root, "data");
const webDir = path.join(root, "web");
const masterKey = await loadMasterKey(path.join(dataDir, "master.key"));
const store = createFileStore(path.join(dataDir, "store.json"));
const clients = new Set<ServerResponse>();
const pilot = createPilot({
  store,
  dataDir,
  masterKey,
  onEvent(event) {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.write(payload);
  },
});

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname === "/api/events") return stream(response);
    if (url.pathname.startsWith("/api/")) return await api(request, response, url);
    return await file(response, url.pathname === "/" ? "/index.html" : url.pathname);
  } catch (error) {
    send(response, 500, { error: error instanceof Error ? error.message : "服务器错误" });
  }
});

const port = Number(process.env.PORT ?? 3210);
server.requestTimeout = 0;
await store.update((db) => {
  db.connections = [];
});
server.listen(port, "127.0.0.1", () => {
  console.log(`Project Pilot: http://127.0.0.1:${port}`);
});

async function api(request: IncomingMessage, response: ServerResponse, url: URL): Promise<void> {
  const parts = url.pathname.split("/").filter(Boolean);
  const body = await readBody(request);
  if (request.method === "GET" && url.pathname === "/api/health") return send(response, 200, { status: "ok" });
  if (request.method === "POST" && url.pathname === "/api/folders/pick") {
    return send(response, 200, { path: await pickFolder() });
  }
  if (request.method === "GET" && url.pathname === "/api/preferences") {
    return send(response, 200, await store.update((db) => db.accountPreference));
  }
  if (request.method === "PUT" && url.pathname === "/api/preferences") {
    await pilot.setAccountPreference(body as ModelPreference);
    return send(response, 200, await store.update((db) => db.accountPreference));
  }
  if (request.method === "GET" && url.pathname === "/api/connections") {
    return send(response, 200, await store.update((db) => db.connections.map(({ encryptedKey: _key, ...item }) => item)));
  }
  if (request.method === "POST" && url.pathname === "/api/connections") {
    const input = body as { provider: string; baseUrl: string; apiKey: string; modelIds: string[] };
    const connection = {
      id: randomUUID(),
      provider: input.provider,
      baseUrl: input.baseUrl,
      modelIds: input.modelIds,
      keyLast4: last4(input.apiKey),
      status: "untested" as const,
      createdAt: new Date().toISOString(),
      encryptedKey: encryptSecret(input.apiKey, masterKey),
    };
    await store.update((db) => db.connections.push(connection));
    const { encryptedKey: _key, ...safe } = connection;
    return send(response, 201, safe);
  }
  if (request.method === "POST" && parts[1] === "connections" && parts[3] === "test") {
    const result = await store.update(async (db) => {
      const connection = db.connections.find((item) => item.id === parts[2]);
      if (!connection) throw new Error("连接不存在");
      const key = decryptSecret(connection.encryptedKey, masterKey);
      const probe = await fetch(`${connection.baseUrl.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${key}` } });
      connection.status = probe.ok ? "ok" : "failed";
      return { status: connection.status, httpStatus: probe.status };
    });
    return send(response, 200, result);
  }
  if (request.method === "DELETE" && parts[1] === "connections" && parts[2]) {
    await store.update((db) => { db.connections = db.connections.filter((item) => item.id !== parts[2]); });
    return send(response, 204, {});
  }
  if (request.method === "GET" && url.pathname === "/api/projects") return send(response, 200, await pilot.listProjects());
  if (request.method === "DELETE" && parts[1] === "projects" && parts[2] && !parts[3]) {
    await pilot.deleteProject(parts[2]);
    return send(response, 204, {});
  }
  if (request.method === "POST" && url.pathname === "/api/projects") return send(response, 201, await pilot.createProject(body as { idea: string; stack?: string }));
  if (parts[1] === "projects" && parts[2] && !parts[3] && request.method === "GET") return send(response, 200, await pilot.getProject(parts[2]));
  if (parts[1] === "projects" && parts[3] === "preference" && request.method === "PUT") return send(response, 200, await pilot.setProjectPreference(parts[2]!, body as ModelPreference));
  if (parts[1] === "projects" && parts[3] === "tasks" && parts[5] === "preference" && request.method === "PUT") {
    return send(response, 200, await pilot.setTaskPreference(parts[2]!, parts[4]!, body as ModelPreference));
  }
  if (parts[1] === "projects" && parts[3] === "tasks" && parts[4] && request.method === "PATCH") {
    return send(response, 200, await pilot.updateTask(parts[2]!, parts[4], body as { title?: string; selectedModelId?: string }));
  }
  if (parts[1] === "projects" && parts[3] === "confirm" && request.method === "POST") {
    return send(response, 200, await pilot.confirm(parts[2]!, (body as { outputDir?: string }).outputDir ?? ""));
  }
  if (parts[1] === "projects" && parts[2] && parts[3] === "control" && request.method === "POST") {
    const action = (body as { action?: string }).action;
    if (action !== "pause" && action !== "resume" && action !== "stop") return send(response, 400, { error: "未知操作" });
    return send(response, 200, await pilot.control(parts[2], action));
  }
  if (parts[1] === "projects" && parts[2] && parts[3] === "messages" && request.method === "POST") {
    return send(response, 200, await pilot.say(parts[2], (body as { text?: string }).text ?? ""));
  }
  if (parts[1] === "projects" && parts[2] && parts[3] === "app" && request.method === "GET") {
    return serveApp(response, parts[2], parts.slice(4));
  }
  if (parts[1] === "projects" && parts[3] === "execute" && request.method === "POST") {
    const input = body as { mode?: "trial" | "connected"; restart?: boolean };
    return send(response, 200, await pilot.execute(parts[2]!, input.mode ?? "trial", input.restart === true));
  }
  if (parts[1] === "projects" && parts[3] === "tasks" && parts[5] === "retry" && request.method === "POST") return send(response, 200, await pilot.retry(parts[2]!, parts[4]!));
  if (parts[1] === "projects" && parts[3] === "decisions" && parts[4] && request.method === "POST") {
    return send(response, 200, await pilot.resolveDecision(parts[2]!, parts[4], (body as { choice: string }).choice));
  }
  send(response, 404, { error: "未找到接口" });
}

function stream(response: ServerResponse): void {
  response.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  response.write(": ok\n\n");
  clients.add(response);
  response.on("close", () => clients.delete(response));
}

async function file(response: ServerResponse, pathname: string): Promise<void> {
  const relative = pathname.replace(/^\/+/, "");
  if (relative.includes("..")) return send(response, 400, { error: "非法路径" });
  try {
    const content = await readFile(path.join(webDir, relative));
    response.writeHead(200, { "Content-Type": contentType(relative), "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    send(response, 404, { error: "未找到页面" });
  }
}

async function serveApp(response: ServerResponse, projectId: string, segments: string[]): Promise<void> {
  const project = await pilot.getProject(projectId);
  const programTask = project.tasks.find((task) => task.capability === "integration");
  const root = await findAppRoot(project.workspaceDir, programTask?.id);
  if (!root) {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><meta charset=\"utf-8\"><p>还没有可运行的页面。</p>");
    return;
  }
  const relative = segments.length ? segments.join("/") : "index.html";
  const target = path.resolve(root, relative);
  const outside = path.relative(root, target);
  if (outside.startsWith("..") || path.isAbsolute(outside)) return send(response, 400, { error: "非法路径" });
  try {
    const content = await readFile(target);
    response.writeHead(200, { "Content-Type": contentType(target), "Cache-Control": "no-store" });
    response.end(content);
  } catch {
    send(response, 404, { error: "没有这个文件" });
  }
}

function contentType(file: string): string {
  if (file.endsWith(".css")) return "text/css; charset=utf-8";
  if (file.endsWith(".js") || file.endsWith(".mjs")) return "text/javascript; charset=utf-8";
  if (file.endsWith(".json")) return "application/json; charset=utf-8";
  if (file.endsWith(".svg")) return "image/svg+xml";
  if (file.endsWith(".png")) return "image/png";
  if (file.endsWith(".jpg") || file.endsWith(".jpeg")) return "image/jpeg";
  if (file.endsWith(".webp")) return "image/webp";
  if (file.endsWith(".html")) return "text/html; charset=utf-8";
  return "text/plain; charset=utf-8";
}

function readBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }
    });
  });
}

function send(response: ServerResponse, status: number, payload: unknown): void {
  if (status === 204) {
    response.writeHead(204);
    response.end();
    return;
  }
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}
