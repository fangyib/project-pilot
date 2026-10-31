import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { defaultAccountPreference } from "../domain/preferences.js";
import type { Database, ModelConnection } from "../domain/types.js";

export interface Store {
  update<T>(fn: (db: Database) => T | Promise<T>): Promise<T>;
}

export function createMemoryStore(seed?: Database): Store {
  let db = seed ?? emptyDatabase();
  let chain: Promise<unknown> = Promise.resolve();
  return {
    update(fn) {
      const run = chain.then(async () => {
        const result = await fn(db);
        db = structuredClone(db);
        return result;
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

export function createFileStore(file: string): Store {
  const sessionConnections: ModelConnection[] = [];
  let chain: Promise<unknown> = Promise.resolve();
  return {
    update(fn) {
      const run = chain.then(async () => {
        const db = await readDatabase(file);
        db.connections = sessionConnections;
        const result = await fn(db);
        sessionConnections.splice(0, sessionConnections.length, ...db.connections);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, JSON.stringify({ ...db, connections: [] }, null, 2), "utf8");
        return result;
      });
      chain = run.then(() => undefined, () => undefined);
      return run;
    },
  };
}

async function readDatabase(file: string): Promise<Database> {
  try {
    return JSON.parse(await readFile(file, "utf8")) as Database;
  } catch {
    return emptyDatabase();
  }
}

function emptyDatabase(): Database {
  return { accountPreference: defaultAccountPreference(), connections: [], projects: [] };
}
