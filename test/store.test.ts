import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createFileStore } from "../src/store/database.js";

test("API Key 只留在本次运行的内存里，不写入文件", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "pilot-store-"));
  const file = path.join(dir, "store.json");
  await writeFile(file, JSON.stringify({
    accountPreference: { scope: "account", scopeId: "account", preset: "balance", region: "any", allowForeignData: true, autoSelect: true, budgetCents: 3000, updatedAt: "2026-10-29" },
    connections: [{ id: "old", provider: "deepseek", encryptedKey: "already-on-disk", keyLast4: "6f19", modelIds: ["deepseek-chat"], baseUrl: "https://api.deepseek.com/v1", status: "untested", createdAt: "2026-10-29" }],
    projects: [{ id: "keep" }],
  }), "utf8");

  const store = createFileStore(file);
  const loaded = await store.update((db) => db.connections.map((item) => item.keyLast4));
  assert.deepEqual(loaded, []);

  const cleared = JSON.parse(await readFile(file, "utf8")) as { connections: unknown[]; projects: { id: string }[] };
  assert.deepEqual(cleared.connections, []);
  assert.equal(cleared.projects[0]?.id, "keep");
  assert.equal(JSON.stringify(cleared).includes("already-on-disk"), false);

  await store.update((db) => {
    db.connections.push({
      id: "now",
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      modelIds: ["deepseek-chat"],
      keyLast4: "abcd",
      status: "untested",
      createdAt: "2026-10-31",
      encryptedKey: "still-secret",
    });
  });
  const disk = JSON.parse(await readFile(file, "utf8")) as { connections: unknown[] };
  assert.deepEqual(disk.connections, []);
  assert.equal(JSON.stringify(disk).includes("still-secret"), false);
  const live = await store.update((db) => db.connections.map((item) => item.keyLast4));
  assert.deepEqual(live, ["abcd"]);
});
