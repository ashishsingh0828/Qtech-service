import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { GridFSBucket } from "mongodb";
import mongoose from "mongoose";
import { config } from "../env.js";
import { HttpError } from "../lib/errors.js";
import { MIME, extOf } from "../lib/sniff.js";

export const KEY_RE = /^[0-9a-f-]{36}\.(pdf|jpg|png|doc|docx)$/;
export const isValidKey = (key) => typeof key === "string" && KEY_RE.test(key);

const usingGridFs = () => config.storageDriver === "gridfs";

function bucket() {
  if (!mongoose.connection?.db) throw new Error("MongoDB is not connected.");
  return new GridFSBucket(mongoose.connection.db, { bucketName: "uploads" });
}

export async function saveFile(buffer, ext) {
  const key = `${crypto.randomUUID()}.${ext}`;
  if (usingGridFs()) {
    await new Promise((resolve, reject) => {
      const stream = bucket().openUploadStream(key, {
        contentType: MIME[ext] || "application/octet-stream",
        metadata: { key },
      });
      stream.once("error", reject);
      stream.once("finish", resolve);
      stream.end(buffer);
    });
    return key;
  }
  await fsp.mkdir(config.uploadDir, { recursive: true });
  await fsp.writeFile(path.join(config.uploadDir, key), buffer, { flag: "wx", mode: 0o640 });
  return key;
}

// Keys are checked against a strict pattern so a stored value can never point outside the folder.
export const filePath = (key) => (isValidKey(key) ? path.join(config.uploadDir, key) : null);

export async function removeFile(key) {
  if (!isValidKey(key)) return;
  if (usingGridFs()) {
    try {
      const doc = await mongoose.connection.db.collection("uploads.files").findOne({ filename: key });
      if (doc) await bucket().delete(doc._id);
    } catch {
      /* already gone */
    }
    return;
  }
  const p = filePath(key);
  if (p) await fsp.rm(p, { force: true });
}

export function contractFileKeys(doc) {
  const keys = [];
  if (doc?.amc?.docFile) keys.push(doc.amc.docFile);
  for (const pm of doc?.pms || []) if (pm.reportFile) keys.push(pm.reportFile);
  return keys;
}

export async function removeContractFiles(doc) {
  for (const key of contractFileKeys(doc)) await removeFile(key);
}

function dispositionName(name) {
  const clean = String(name || "file").replace(/["\\]/g, "_").replace(/[\r\n]/g, " ").slice(0, 120);
  return clean || "file";
}

export function sendStored(res, next, key, name) {
  if (!isValidKey(key)) return next(new HttpError(404, "No file is attached."));
  res.setHeader("Content-Type", MIME[extOf(key)] || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${dispositionName(name)}"`);

  const fail = () => {
    if (!res.headersSent) next(new HttpError(404, "No file is attached."));
    else res.end();
  };

  if (usingGridFs()) {
    try {
      const stream = bucket().openDownloadStreamByName(key);
      stream.on("error", fail);
      stream.pipe(res);
    } catch (e) {
      fail();
    }
    return;
  }

  const p = filePath(key);
  if (!p) return fail();
  const stream = fs.createReadStream(p);
  stream.on("error", fail);
  stream.pipe(res);
}
