import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export async function loadMasterKey(file: string): Promise<Buffer> {
  try {
    return await readFile(file);
  } catch {
    await mkdir(path.dirname(file), { recursive: true });
    const key = randomBytes(32);
    await writeFile(file, key);
    return key;
  }
}

export function encryptSecret(secret: string, masterKey: Buffer): string {
  const iv = randomBytes(12);
  const key = scryptSync(masterKey, "project-pilot", 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${encrypted.toString("base64")}`;
}

export function decryptSecret(payload: string, masterKey: Buffer): string {
  const [iv, tag, data] = payload.split(".");
  if (!iv || !tag || !data) throw new Error("凭据格式无效");
  const key = scryptSync(masterKey, "project-pilot", 32);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}

export function last4(secret: string): string {
  return secret.slice(-4);
}
