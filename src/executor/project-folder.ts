import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertRelativePath } from "./workspace.js";

const skipped = new Set([".git", "node_modules"]);

export function resolveProjectPath(root: string, filePath: string): string {
  const relative = assertRelativePath(filePath);
  const base = path.resolve(root);
  const absolute = path.resolve(base, relative);
  const compared = path.relative(base, absolute);
  if (!compared || compared.startsWith("..") || path.isAbsolute(compared)) throw new Error("不能访问项目文件夹以外的位置");
  return absolute;
}

export async function listProjectFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > 5 || found.length >= 80) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (found.length >= 80 || skipped.has(entry.name)) continue;
      const absolute = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute, depth + 1);
        continue;
      }
      found.push(path.relative(root, absolute).replaceAll("\\", "/"));
    }
  }
  await walk(root, 0);
  return found;
}

export async function readProjectFile(root: string, filePath: string): Promise<string> {
  const absolute = resolveProjectPath(root, filePath);
  const content = await readFile(absolute, "utf8");
  if (content.length <= 120_000) return content;
  return `${content.slice(0, 120_000)}\n\n[后面还有 ${content.length - 120_000} 个字符，这次没有全部读出]`;
}

export async function writeProjectFile(root: string, filePath: string, content: string): Promise<string> {
  const relative = assertRelativePath(filePath);
  const absolute = resolveProjectPath(root, relative);
  await mkdir(path.dirname(absolute), { recursive: true });
  await writeFile(absolute, content, "utf8");
  return relative;
}
