// File storage drivers (disk and GridFS). Separate process from api.test.js so env.js loads cleanly.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod, uploadDir, app, config, User, Contract;
const PW = "password-123";
const ids = {};
const agents = {};
const PDF = Buffer.from("%PDF-1.4\n% storage report\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]);

const binary = (res, cb) => {
  const chunks = [];
  res.on("data", (c) => chunks.push(c));
  res.on("end", () => cb(null, Buffer.concat(chunks)));
};

async function as(role) {
  if (!agents[role]) {
    const a = request.agent(app);
    await a.post("/api/auth/login").send({ email: `${role}@t.test`, password: PW }).expect(200);
    agents[role] = a;
  }
  return agents[role];
}

async function gridCount() {
  if (!mongoose.connection?.db) return 0;
  return mongoose.connection.db.collection("uploads.files").countDocuments();
}

before(async () => {
  mongod = await MongoMemoryServer.create();
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-store-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "t".repeat(48),
    MONGO_URI: mongod.getUri("sd_storage"),
    OTP_DEV_ECHO: "true",
    NOTIFY_PROVIDER: "console",
    OTP_RESEND_SECONDS: "0",
    BCRYPT_ROUNDS: "4",
    LOGIN_RATE_MAX: "1000",
    UPLOAD_DIR: uploadDir,
    CLIENT_ORIGIN: "http://localhost:5173",
    STORAGE_DRIVER: "disk",
  });
  await mongoose.connect(process.env.MONGO_URI);
  ({ config } = await import("../../src/env.js"));
  ({ User } = await import("../../src/models/User.js"));
  ({ Contract } = await import("../../src/models/Contract.js"));
  const { createApp } = await import("../../src/app.js");
  app = createApp();

  const passwordHash = await bcrypt.hash(PW, 4);
  for (const role of ["admin", "coordinator", "engineer", "engineer2", "accounts"]) {
    const u = await User.create({
      name: role.toUpperCase(),
      email: `${role}@t.test`,
      role: role === "engineer2" ? "engineer" : role,
      passwordHash,
    });
    ids[role] = String(u._id);
  }
});

after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

async function seedContract(cust) {
  const c = await Contract.create({
    cust,
    engineer: ids.engineer,
    equip: "Pump",
    serial: cust + "-1",
    mobile: "9800000000",
    mail: "c@x.test",
    type: "CMC",
    start: "2026-01-01",
    end: "2027-01-01",
    pms: ["2026-05-01", "2026-11-01"].map((date) => ({ date })),
  });
  return String(c._id);
}

async function exerciseDriver(driver) {
  config.storageDriver = driver;
  const diskBefore = fs.readdirSync(uploadDir);
  const gridBefore = await gridCount();
  const cid = await seedContract(driver + "-Co");
  const e = await as("engineer");
  const e2 = await as("engineer2");
  const acc = await as("accounts");

  const otp = (await e.post("/api/otp").send({ contractId: cid, pmIndex: 0 }).expect(200)).body.demoCode;
  await e.post(`/api/contracts/${cid}/pms/0/close`).field("otp", otp).attach("report", PDF, "report.pdf").expect(200);

  const diskAfterClose = fs.readdirSync(uploadDir);
  if (driver === "gridfs") {
    assert.deepEqual(diskAfterClose, diskBefore);
    assert.equal(await gridCount(), gridBefore + 1);
  } else {
    assert.equal(diskAfterClose.length, diskBefore.length + 1);
  }

  const reportUrl = `/api/contracts/${cid}/pms/0/report`;
  const dl = await e.get(reportUrl).buffer(true).parse(binary).expect(200);
  assert.match(dl.headers["content-type"], /pdf/);
  assert.match(dl.headers["content-disposition"], /attachment/);
  assert.match(dl.headers["content-disposition"], /report\.pdf/);
  assert.equal(dl.body.subarray(0, 5).toString(), "%PDF-");
  assert.equal((await e2.get(reportUrl)).status, 404);
  assert.equal((await (await as("coordinator")).get(reportUrl)).status, 200);

  const amcUrl = `/api/contracts/${cid}/amc`;
  const code1 = (await acc.post("/api/otp").send({ contractId: cid }).expect(200)).body.demoCode;
  await acc.put(amcUrl).field("state", "Accepted").field("otp", code1).attach("doc", PNG, "cheque.png").expect(200);
  const firstDoc = await acc.get(`${amcUrl}/document`).buffer(true).parse(binary).expect(200);
  assert.match(firstDoc.headers["content-type"], /image\/png/);
  assert.equal((await e2.get(`${amcUrl}/document`)).status, 404);

  const code2 = (await acc.post("/api/otp").send({ contractId: cid }).expect(200)).body.demoCode;
  await acc.put(amcUrl).field("state", "Accepted").field("otp", code2).attach("doc", JPG, "cheque2.jpg").expect(200);
  const replaced = await acc.get(`${amcUrl}/document`).buffer(true).parse(binary).expect(200);
  assert.match(replaced.headers["content-type"], /image\/jpeg/);
  assert.equal(replaced.body[0], 0xff);
  assert.equal(replaced.body[1], 0xd8);

  if (driver === "gridfs") {
    assert.deepEqual(fs.readdirSync(uploadDir), diskBefore);
    assert.equal(await gridCount(), gridBefore + 2); // report + current AMC doc (old AMC removed)
  }

  await Contract.deleteMany({ _id: cid });
  assert.equal((await e.get(reportUrl)).status, 404);
  assert.equal((await acc.get(`${amcUrl}/document`)).status, 404);
  if (driver === "gridfs") assert.equal(await gridCount(), gridBefore);
  if (driver === "disk") assert.deepEqual(fs.readdirSync(uploadDir), diskBefore);
}

test("disk: upload, download as owner, 404 for another engineer, replace, delete", async () => {
  await exerciseDriver("disk");
});

test("gridfs: upload, download as owner, 404 for another engineer, replace, delete", async () => {
  await exerciseDriver("gridfs");
});
