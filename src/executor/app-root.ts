import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const textExtensions = new Set([".md", ".html", ".js", ".mjs", ".css", ".json", ".txt", ".svg"]);

export async function findAppRoot(workspaceDir: string, programTaskId?: string | null): Promise<string | null> {
  if (programTaskId) {
    const preferred = path.join(workspaceDir, "tasks", programTaskId);
    try {
      await access(path.join(preferred, "index.html"));
      return preferred;
    } catch {
      // 集成任务还没有写出页面时，再找其他入口。
    }
  }
  const found: { dir: string; mtime: number }[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    if (entries.some((entry) => entry.isFile() && entry.name === "index.html")) {
      const info = await stat(path.join(dir, "index.html"));
      found.push({ dir, mtime: info.mtimeMs });
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name === ".git" || entry.name === "node_modules") continue;
      await walk(path.join(dir, entry.name), depth + 1);
    }
  }
  await walk(workspaceDir, 0);
  found.sort((left, right) => right.mtime - left.mtime);
  return found[0]?.dir ?? null;
}

export async function summarizeProjectFiles(workspaceDir: string): Promise<string> {
  const files: { relative: string; content: string }[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 4 || files.length >= 12) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files.length >= 12) return;
      if (entry.name === ".git" || entry.name === "node_modules") continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
        continue;
      }
      if (!textExtensions.has(path.extname(entry.name).toLowerCase())) continue;
      const content = await readFile(absolute, "utf8").catch(() => "");
      if (!content.trim()) continue;
      files.push({ relative: path.relative(workspaceDir, absolute), content: content.slice(0, 700) });
    }
  }
  await walk(workspaceDir, 0);
  return files.map((file) => `### ${file.relative}\n${file.content}`).join("\n\n");
}
