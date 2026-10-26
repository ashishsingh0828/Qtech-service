import crypto from "node:crypto";

export const generateCode = (len) => String(crypto.randomInt(0, 10 ** len)).padStart(len, "0");

// The database stores only an HMAC of the code, never the code itself.
export const hashCode = (secret, key, code) => crypto.createHmac("sha256", secret).update(`${key}:${code}`).digest("hex");

export function safeEqualHex(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
