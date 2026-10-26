import { HttpError } from "./errors.js";
import { isIsoDate } from "./dates.js";

const bad = (msg) => new HttpError(400, msg);

// Only strings and numbers are accepted. Objects (e.g. {"$gt": ""}) become "" so they can
// never reach a database query.
export const str = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) : typeof v === "number" ? String(v).slice(0, max) : "";

export function oneOf(v, list, msg) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!list.includes(s)) throw bad(msg);
  return s;
}

export function optDate(v, msg) {
  const s = str(v, 10);
  if (s && !isIsoDate(s)) throw bad(msg);
  return s;
}

export function reqDate(v, msg) {
  const s = str(v, 10);
  if (!isIsoDate(s)) throw bad(msg);
  return s;
}

export const EMAIL_RE = /^\S+@\S+\.\S+$/;
export const isObjectId = (s) => typeof s === "string" && /^[0-9a-f]{24}$/i.test(s);
export const parseIndex = (raw, length) => {
  if (!/^\d+$/.test(String(raw))) return -1;
  const i = Number(raw);
  return i < length ? i : -1;
};
