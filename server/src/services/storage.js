import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { config } from "../env.js";

const KEY_RE = /^[0-9a-f-]{36}\.(pdf|jpg|png|doc|docx)$/;

export async function saveFile(buffer, ext) {
  await fs.mkdir(config.uploadDir, { recursive: true });
  const key = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(config.uploadDir, key), buffer, { flag: "wx", mode: 0o640 });
  return key;
}

// Keys are checked against a strict pattern so a stored value can never point outside the folder.
export const filePath = (key) => (typeof key === "string" && KEY_RE.test(key) ? path.join(config.uploadDir, key) : null);

export async function removeFile(key) {
  const p = filePath(key);
  if (p) await fs.rm(p, { force: true });
}
