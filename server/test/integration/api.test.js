// Runs the real Express app against an in-memory MongoDB.
// First run downloads a MongoDB binary, so it needs internet once.   npm run test:int
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { MongoMemoryServer } from "mongodb-memory-server";

let mongod, uploadDir, app, User, Contract, todayIso;
const PW = "password-123";
const ids = {};
const agents = {};

const PDF = Buffer.from("%PDF-1.4\n% test report\n");
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
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
const list = async (role) => (await (await as(role)).get("/api/contracts").expect(200)).body;

before(async () => {
  mongod = await MongoMemoryServer.create();
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "sd-up-"));
  Object.assign(process.env, {
    NODE_ENV: "test",
    JWT_SECRET: "t".repeat(48),
    MONGO_URI: mongod.getUri("sd_test"),
    OTP_DEV_ECHO: "true",
    NOTIFY_PROVIDER: "console",
    OTP_RESEND_SECONDS: "0",
    BCRYPT_ROUNDS: "4",
    LOGIN_RATE_MAX: "1000",
    UPLOAD_DIR: uploadDir,
    CLIENT_ORIGIN: "http://localhost:5173",
  });
  await mongoose.connect(process.env.MONGO_URI);
  ({ User } = await import("../../src/models/User.js"));
  ({ Contract } = await import("../../src/models/Contract.js"));
  ({ todayIso } = await import("../../src/lib/dates.js"));
  const { createApp } = await import("../../src/app.js");
  app = createApp();

  const passwordHash = await bcrypt.hash(PW, 4);
  for (const role of ["admin", "coordinator", "manager", "accounts", "engineer", "engineer2"]) {
    const u = await User.create({ name: role.toUpperCase(), email: `${role}@t.test`, role: role === "engineer2" ? "engineer" : role, passwordHash });
    ids[role] = String(u._id);
  }
  const mk = (cust, engineer) => ({
    cust, engineer, equip: "Pump", serial: cust + "-1", mobile: "9800000000", mail: "c@x.test", type: "CMC",
    start: "2026-01-01", end: "2027-01-01",
    pms: ["2026-05-01", "2026-11-01", "2027-05-01", "2027-06-01"].map((date) => ({ date })),
  });
  const [c1, c2] = await Contract.create([mk("Apex", ids.engineer), mk("Other", ids.engineer2)]);
  ids.c1 = String(c1._id);
  ids.c2 = String(c2._id);
});

after(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

test("sign in, session, sign out", async () => {
  const bad = await request(app).post("/api/auth/login").send({ email: "admin@t.test", password: "nope" });
  const unknown = await request(app).post("/api/auth/login").send({ email: "ghost@t.test", password: "nope" });
  assert.equal(bad.status, 401);
  assert.equal(unknown.status, 401);
  assert.equal(bad.body.message, unknown.body.message); // no hint whether the email exists

  const injection = await request(app).post("/api/auth/login").send({ email: { $ne: "" }, password: { $ne: "" } });
  assert.equal(injection.status, 401);

  const a = request.agent(app);
  const ok = await a.post("/api/auth/login").send({ email: "Admin@T.test", password: PW }).expect(200);
  assert.equal(ok.body.user.role, "admin");
  assert.equal(ok.body.user.passwordHash, undefined);
  assert.match(ok.headers["set-cookie"][0], /HttpOnly/i);
  assert.equal((await a.get("/api/auth/me")).body.user.email, "admin@t.test");
  await a.post("/api/auth/logout").expect(200);
  assert.equal((await a.get("/api/auth/me")).body.user, null);
});

test("everything except login needs a session", async () => {
  for (const url of ["/api/contracts", "/api/users/engineers", "/api/users", "/api/excel/export"]) {
    assert.equal((await request(app).get(url)).status, 401, url);
  }
  assert.equal((await request(app).post("/api/otp").send({})).status, 401);
});

test("cross-site writes are refused", async () => {
  const a = await as("admin");
  const r = await a.post("/api/contracts").set("Origin", "https://evil.example").send({});
  assert.equal(r.status, 403);
});

test("same-origin writes are allowed when the UI is served from this server", async () => {
  const a = await as("admin");
  const r = await a
    .put(`/api/contracts/${ids.c1}/validation`)
    .set("Origin", "https://qtech-service.onrender.com")
    .set("Host", "qtech-service.onrender.com")
    .set("X-Forwarded-Proto", "https")
    .send({ valid: "Yes", vby: "Admin" });
  assert.equal(r.status, 200);
});

test("engineers only see and touch their own contracts", async () => {
  const mine = await list("engineer");
  assert.deepEqual(mine.map((c) => c.cust), ["Apex"]);
  assert.equal(mine[0].engineerId, ids.engineer);
  assert.equal((await list("coordinator")).length, 2);

  const e = await as("engineer");
  assert.equal((await e.post("/api/otp").send({ contractId: ids.c2, pmIndex: 0 })).status, 404);
  assert.equal((await e.post(`/api/contracts/${ids.c2}/pms/0/ack`)).status, 404);
  assert.equal((await e.get(`/api/contracts/${ids.c2}/amc/document`)).status, 404);
  assert.equal((await e.post(`/api/contracts/not-an-id/pms/0/ack`)).status, 404);
});

test("roles are enforced on the server, not just hidden in the UI", async () => {
  const body = { cust: "X", equip: "Y", start: "2026-01-01", end: "2027-01-01" };
  assert.equal((await (await as("coordinator")).post("/api/contracts").send(body)).status, 403);
  assert.equal((await (await as("engineer")).get("/api/users")).status, 403);
  assert.equal((await (await as("engineer")).get("/api/excel/export")).status, 403);
  assert.equal((await (await as("manager")).put(`/api/contracts/${ids.c1}/engineer`).send({ engineerId: ids.engineer2 })).status, 403);
  assert.equal((await (await as("coordinator")).post(`/api/contracts/${ids.c1}/pms/0/ack`)).status, 403);
  assert.equal((await (await as("admin")).post(`/api/contracts/${ids.c1}/pms/0/ack`)).status, 403);
  assert.equal((await (await as("coordinator")).post("/api/otp").send({ contractId: ids.c1 })).status, 403);
});

test("OTP: wrong code, bad file, then the right code closes the PM once", async () => {
  const e = await as("engineer");
  const otp = (await e.post("/api/otp").send({ contractId: ids.c1, pmIndex: 0 }).expect(200)).body;
  assert.equal(otp.sent, true);
  assert.match(otp.demoCode, /^\d{6}$/);
  const url = `/api/contracts/${ids.c1}/pms/0/close`;
  const wrong = otp.demoCode === "000000" ? "111111" : "000000";

  const r1 = await e.post(url).field("otp", wrong).attach("report", PDF, "report.pdf");
  assert.equal(r1.status, 400);
  assert.match(r1.body.message, /OTP/);
  assert.equal((await e.post(url).field("otp", otp.demoCode)).status, 400); // no report attached
  const fake = await e.post(url).field("otp", otp.demoCode).attach("report", Buffer.from("<html>hi</html>"), "report.pdf");
  assert.equal(fake.status, 400);
  assert.equal((await e.post(url).field("otp", otp.demoCode).attach("report", PDF, "evil.exe")).status, 400);

  await e.post(url).field("otp", otp.demoCode).attach("report", PDF, "report.pdf").expect(200);
  const pm = (await list("engineer"))[0].pms[0];
  assert.equal(pm.state, "Closed");
  assert.equal(pm.done, todayIso("Asia/Kolkata"));
  assert.equal(pm.reportFile, undefined); // internal names never reach the browser
  assert.equal(pm.hasReport, true); // but the UI is told a report exists, so it can show the link
  assert.equal(fs.readdirSync(uploadDir).length, 1);

  const again = await e.post(url).field("otp", otp.demoCode).attach("report", PDF, "report.pdf");
  assert.equal(again.status, 400);
  assert.match(again.body.message, /already closed/);

  // coordinator can download it, the other engineer cannot
  assert.equal((await (await as("coordinator")).get(`/api/contracts/${ids.c1}/pms/0/report`)).status, 200);
  assert.equal((await (await as("engineer2")).get(`/api/contracts/${ids.c1}/pms/0/report`)).status, 404);
});

test("OTP is single use, tied to one PM, and locks after too many wrong tries", async () => {
  const e = await as("engineer");
  const delay = (i, otp) => e.post(`/api/contracts/${ids.c1}/pms/${i}/delay`).send({ reason: "Customer Not Available", plan: "2026-12-01", otp });

  const a = (await e.post("/api/otp").send({ contractId: ids.c1, pmIndex: 1 })).body.demoCode;
  assert.equal((await delay(2, a)).status, 400); // code was issued for PM 1, not PM 2
  assert.equal((await delay(1, a)).status, 200);
  assert.equal((await delay(1, a)).status, 400); // already used
  assert.equal((await list("engineer"))[0].pms[1].state, "Delayed");

  const b = (await e.post("/api/otp").send({ contractId: ids.c1, pmIndex: 3 })).body.demoCode;
  const wrong = b === "999999" ? "888888" : "999999";
  for (let i = 0; i < 5; i++) assert.equal((await delay(3, wrong)).status, 400);
  assert.equal((await delay(3, b)).status, 400); // correct code, but locked out now

  // other delay reasons do not need an OTP
  const other = await e.post(`/api/contracts/${ids.c1}/pms/2/delay`).send({ reason: "Other reason", remark: "Spare part", plan: "2026-12-01" });
  assert.equal(other.status, 200);
  assert.match((await list("engineer"))[0].pms[2].reason, /Other reason: Spare part/);
});

test("AMC: needs a document and an OTP to be accepted; file access follows the contract", async () => {
  const acc = await as("accounts");
  const url = `/api/contracts/${ids.c1}/amc`;
  assert.equal((await acc.put(url).field("state", "Accepted")).status, 400); // no document
  assert.equal((await acc.put(url).field("state", "Delayed").field("reason", "Other reason")).status, 400); // no date
  const noOtp = await acc.put(url).field("state", "Accepted").attach("doc", PNG, "cheque.png");
  assert.equal(noOtp.status, 400);

  const code = (await acc.post("/api/otp").send({ contractId: ids.c1 }).expect(200)).body.demoCode;
  await acc.put(url).field("state", "Accepted").field("otp", code).attach("doc", PNG, "cheque.png").expect(200);

  const amc = (await list("manager")).find((c) => c.id === ids.c1).amc;
  assert.equal(amc.state, "Accepted");
  assert.equal(amc.doc, "cheque.png");
  assert.equal(amc.docFile, undefined);

  const dl = await acc.get(`${url}/document`).expect(200);
  assert.match(dl.headers["content-type"], /image\/png/);
  assert.equal((await (await as("engineer2")).get(`${url}/document`)).status, 404);
  assert.equal((await (await as("coordinator")).put(url).field("state", "Pending")).status, 403);
});

test("admin adds a contract with its PM schedule; coordinator assigns an engineer", async () => {
  const admin = await as("admin");
  const bad = await admin.post("/api/contracts").send({ cust: "N", equip: "E", start: "2027-01-01", end: "2026-01-01" });
  assert.equal(bad.status, 400);
  const made = await admin.post("/api/contracts").send({ cust: "New Co", equip: "Fridge", start: "2026-01-01", end: "2027-01-01", type: "Paid AMC" }).expect(201);
  assert.equal(made.body.pms.length, 2);

  const coord = await as("coordinator");
  await coord.put(`/api/contracts/${made.body.id}/engineer`).send({ engineerId: ids.engineer2 }).expect(200);
  assert.equal((await list("engineer2")).some((c) => c.cust === "New Co"), true);
  assert.equal((await coord.put(`/api/contracts/${made.body.id}/engineer`).send({ engineerId: ids.admin })).status, 400); // not an engineer
  await coord.put(`/api/contracts/${made.body.id}/engineer`).send({ engineerId: "" }).expect(200);
  assert.equal((await list("engineer2")).some((c) => c.cust === "New Co"), false);
});

test("Excel: export, re-import (all duplicates), wipe, import again, and CSV", async () => {
  const admin = await as("admin");
  const before = await list("admin");

  const exp = await admin.get("/api/excel/export").buffer(true).parse(binary).expect(200);
  assert.match(exp.headers["content-type"], /spreadsheetml/);
  assert.equal(exp.body.subarray(0, 2).toString(), "PK");

  const again = await admin.post("/api/excel/import").attach("file", exp.body, "Engineer_Service_Data.xlsx").expect(200);
  assert.deepEqual(again.body, { imported: 0, skipped: before.length, unreadable: 0 });

  await Contract.deleteMany({});
  const restored = await admin.post("/api/excel/import").attach("file", exp.body, "Engineer_Service_Data.xlsx").expect(200);
  assert.deepEqual(restored.body, { imported: before.length, skipped: 0, unreadable: 0 });

  const after = await list("admin");
  const pick = (c) => [c.cust, c.equip, c.start, c.end, c.pms.map((p) => p.date + "/" + p.done)];
  assert.deepEqual(after.map(pick), before.map(pick));
  // engineers are matched by name, so assignments survive the round trip
  assert.deepEqual(after.map((c) => c.engineerId), before.map((c) => c.engineerId));

  const csv = "Customer Name,Euipment Name,Start Date,End Date\nCsv Co,Pump,2026-01-01,2027-01-01\n,,,\nBroken,Pump,,\n";
  const c = await admin.post("/api/excel/import").attach("file", Buffer.from(csv), "x.csv").expect(200);
  assert.deepEqual(c.body, { imported: 1, skipped: 0, unreadable: 1 });

  assert.equal((await admin.post("/api/excel/import").attach("file", Buffer.from("x"), "old.xls")).status, 400);
  assert.equal((await admin.post("/api/excel/import").attach("file", Buffer.from("not a zip"), "fake.xlsx")).status, 400);
  assert.equal((await admin.post("/api/excel/import")).status, 400);
  assert.equal((await (await as("engineer")).post("/api/excel/import").attach("file", exp.body, "a.xlsx")).status, 403);
});

test("users: create, validate, sign in as them, delete", async () => {
  const admin = await as("admin");
  const body = { name: "Nina", email: "Nina@T.test", role: "manager", password: "longenough1" };
  assert.equal((await admin.post("/api/users").send({ ...body, password: "short" })).status, 400);
  assert.equal((await admin.post("/api/users").send({ ...body, role: "root" })).status, 400);
  const made = await admin.post("/api/users").send(body).expect(201);
  assert.equal(made.body.user.email, "nina@t.test");
  assert.equal((await admin.post("/api/users").send(body)).status, 400); // duplicate

  const nina = request.agent(app);
  await nina.post("/api/auth/login").send({ email: "nina@t.test", password: "longenough1" }).expect(200);
  assert.equal((await nina.get("/api/users")).status, 403);

  assert.equal((await admin.delete(`/api/users/${ids.admin}`)).status, 400); // not yourself
  await admin.delete(`/api/users/${made.body.user.id}`).expect(200);
  assert.equal((await nina.get("/api/contracts")).status, 401); // their session dies with the account
});

test("admin edits users: password reset ends old sessions, role change unassigns", async () => {
  const admin = await as("admin");
  const email = "eli@t.test";
  const made = await admin.post("/api/users").send({ name: "Eli", email, role: "engineer", password: "firstpass-1" }).expect(201);
  const eid = made.body.user.id;
  const old = request.agent(app);
  await old.post("/api/auth/login").send({ email, password: "firstpass-1" }).expect(200);
  await old.get("/api/contracts").expect(200);
  const mine = await Contract.create({ cust: "Eli Co", equip: "Pump", start: "2026-01-01", end: "2027-01-01", engineer: eid }); // own data: earlier tests wipe the shared contracts

  assert.equal((await admin.put(`/api/users/${eid}`).send({})).status, 400); // nothing to change
  assert.equal((await admin.put(`/api/users/${eid}`).send({ password: "short" })).status, 400);
  assert.equal((await admin.put(`/api/users/${eid}`).send({ role: "root" })).status, 400);
  assert.equal((await admin.put(`/api/users/${ids.admin}`).send({ role: "manager" })).status, 400); // not your own role
  assert.equal((await admin.put("/api/users/nope").send({ name: "x" })).status, 404);
  assert.equal(((await (await as("manager")).put(`/api/users/${eid}`).send({ name: "x" }))).status, 403);
  assert.equal((await admin.put(`/api/users/${eid}`).send({ name: "Eli B" }).expect(200)).body.user.name, "Eli B");
  await old.get("/api/contracts").expect(200); // a rename does not log anyone out

  await new Promise((r) => setTimeout(r, 1100)); // token times have 1 second resolution
  await admin.put(`/api/users/${eid}`).send({ password: "second-pass-2" }).expect(200);
  assert.equal((await old.get("/api/contracts")).status, 401); // the old session is over
  assert.equal((await request(app).post("/api/auth/login").send({ email, password: "firstpass-1" })).status, 401);
  const fresh = request.agent(app);
  await fresh.post("/api/auth/login").send({ email, password: "second-pass-2" }).expect(200);
  await fresh.get("/api/contracts").expect(200); // a new session works straight away

  await admin.put(`/api/users/${eid}`).send({ role: "manager" }).expect(200);
  assert.equal((await list("admin")).find((c) => c.id === String(mine._id)).engineerId, ""); // no longer an engineer
  await admin.delete(`/api/users/${eid}`).expect(200);
});

test("deleting an engineer unassigns their contracts", async () => {
  const admin = await as("admin");
  await Contract.updateMany({}, { $set: { engineer: ids.engineer2 } });
  await admin.delete(`/api/users/${ids.engineer2}`).expect(200);
  assert.ok((await list("admin")).every((c) => c.engineerId === ""));
});
