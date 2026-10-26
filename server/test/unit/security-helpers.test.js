import test from "node:test";
import assert from "node:assert/strict";
import { generateCode, hashCode, safeEqualHex } from "../../src/lib/otpCrypto.js";
import { extOf, safeName, sniffMatches } from "../../src/lib/sniff.js";
import { oneOf, optDate, parseIndex, str } from "../../src/lib/validate.js";
import { loadConfig } from "../../src/config.js";

const SECRET = "x".repeat(40);

test("OTP codes have the right length, including leading zeros", () => {
  for (let i = 0; i < 200; i++) assert.match(generateCode(6), /^\d{6}$/);
});

test("OTP hash is bound to the key, the code and the secret", () => {
  const h = hashCode(SECRET, "c1:0", "123456");
  assert.equal(safeEqualHex(h, hashCode(SECRET, "c1:0", "123456")), true);
  assert.equal(safeEqualHex(h, hashCode(SECRET, "c1:0", "123457")), false);
  assert.equal(safeEqualHex(h, hashCode(SECRET, "c1:1", "123456")), false); // other PM
  assert.equal(safeEqualHex(h, hashCode("y".repeat(40), "c1:0", "123456")), false);
  assert.equal(safeEqualHex(h, null), false);
  assert.equal(safeEqualHex(h, "zz"), false);
});

test("uploads must match their extension's real file signature", () => {
  const pdf = Buffer.from("%PDF-1.7\n...");
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0]);
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0]);
  const exe = Buffer.from("MZ\x90\x00");
  assert.equal(sniffMatches("pdf", pdf), true);
  assert.equal(sniffMatches("png", png), true);
  assert.equal(sniffMatches("jpeg", jpg), true);
  assert.equal(sniffMatches("jpg", jpg), true);
  assert.equal(sniffMatches("docx", zip), true);
  assert.equal(sniffMatches("pdf", exe), false);
  assert.equal(sniffMatches("pdf", png), false);
  assert.equal(sniffMatches("html", Buffer.from("<html>")), false);
  assert.equal(sniffMatches("pdf", Buffer.alloc(0)), false);
});

test("file name helpers", () => {
  assert.equal(extOf("Report.FINAL.PDF"), "pdf");
  assert.equal(extOf("noext"), "");
  assert.equal(safeName("../../etc/passwd"), ".. .. etc passwd");
  assert.equal(safeName("a\u0000b\nc.pdf"), "abc.pdf");
  assert.equal(safeName(""), "file");
  assert.ok(safeName("x".repeat(500)).length <= 120);
});

test("str drops objects, so query operators can never get through", () => {
  assert.equal(str({ $gt: "" }), "");
  assert.equal(str(["a"]), "");
  assert.equal(str("  hi  "), "hi");
  assert.equal(str(98000), "98000");
  assert.equal(str("x".repeat(500), 10).length, 10);
});

test("oneOf, optDate, parseIndex", () => {
  assert.equal(oneOf("Yes", ["Yes", "No"], "m"), "Yes");
  assert.throws(() => oneOf({ a: 1 }, ["Yes", "No"], "m"), /m/);
  assert.equal(optDate("", "m"), "");
  assert.equal(optDate("2026-02-10", "m"), "2026-02-10");
  assert.throws(() => optDate("10/02/2026", "m"), /m/);
  assert.equal(parseIndex("2", 3), 2);
  assert.equal(parseIndex("3", 3), -1);
  assert.equal(parseIndex("-1", 3), -1);
  assert.equal(parseIndex("1.5", 3), -1);
  assert.equal(parseIndex("abc", 3), -1);
});

test("config refuses unsafe production settings", () => {
  const good = { NODE_ENV: "production", JWT_SECRET: SECRET, MONGO_URI: "mongodb://db/x", NOTIFY_PROVIDER: "smtp", SMTP_HOST: "smtp.x" };
  assert.doesNotThrow(() => loadConfig(good));
  assert.throws(() => loadConfig({ ...good, JWT_SECRET: "short" }), /JWT_SECRET/);
  assert.throws(() => loadConfig({ ...good, OTP_DEV_ECHO: "true" }), /OTP_DEV_ECHO/);
  assert.throws(() => loadConfig({ ...good, NOTIFY_PROVIDER: "console" }), /console/);
  assert.throws(() => loadConfig({ ...good, MONGO_URI: "" }), /MONGO_URI/);
  assert.equal(loadConfig(good).cookieSecure, true);
  // development is relaxed
  const dev = loadConfig({ JWT_SECRET: SECRET, OTP_DEV_ECHO: "true" });
  assert.equal(dev.otp.devEcho, true);
  assert.equal(dev.cookieSecure, false);
  assert.equal(dev.port, 5000);
});

test("development accepts localhost and 127.0.0.1; production only what is configured", () => {
  const dev = loadConfig({ JWT_SECRET: SECRET, CLIENT_ORIGIN: "http://localhost:5173" });
  assert.ok(dev.clientOrigins.includes("http://localhost:5173"));
  assert.ok(dev.clientOrigins.includes("http://127.0.0.1:5173"));
  const prod = loadConfig({ NODE_ENV: "production", JWT_SECRET: SECRET, MONGO_URI: "mongodb://db/x", NOTIFY_PROVIDER: "smtp", SMTP_HOST: "smtp.x", CLIENT_ORIGIN: "https://app.example.com" });
  assert.deepEqual(prod.clientOrigins, ["https://app.example.com"]);
});
