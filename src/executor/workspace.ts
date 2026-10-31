import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function assertRelativePath(filePath: string): string {
  const normalized = filePath.replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.split("/").includes("..")) throw new Error(`非法路径：${filePath}`);
  return normalized;
}

export async function writeWorkspaceFiles(root: string, files: Record<string, string>): Promise<{ path: string; additions: number }[]> {
  const written: { path: string; additions: number }[] = [];
  for (const [filePath, content] of Object.entries(files)) {
    const relative = assertRelativePath(filePath);
    const absolute = path.join(root, relative);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, content, "utf8");
    written.push({ path: relative, additions: content.split(/\r?\n/).length });
  }
  return written;
}

export async function readWorkspaceFile(root: string, filePath: string): Promise<string | null> {
  try {
    return await readFile(path.join(root, assertRelativePath(filePath)), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
