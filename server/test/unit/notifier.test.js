import test from "node:test";
import assert from "node:assert/strict";
import { HttpError } from "../../src/lib/errors.js";
import { buildOtpEmail, deliverOtp, mapResendError, sendResendEmail } from "../../src/services/notifier.js";

const FROM = "Qtech Service Desk <noreply@qtech.example>";
const notify = {
  provider: "resend",
  resend: { apiKey: "re_test_key", from: FROM },
  smtp: { from: FROM },
};

function mockRes(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  };
}

test("OTP email includes the code, equipment, validity and the customer warning", () => {
  const { subject, text, html } = buildOtpEmail({ code: "042187", equip: "CO2 Incubator", ttlMinutes: 10 });
  assert.match(subject, /Qtech Service Desk/);
  for (const part of [text, html]) {
    assert.match(part, /042187/);
    assert.match(part, /CO2 Incubator/);
    assert.match(part, /10 minutes/);
    assert.match(part, /Give this code to the engineer only if the service has been done or the visit was agreed/);
  }
});

test("resend sends over HTTPS and does not use SMTP", async () => {
  let called = 0;
  const fetchFn = async (url, opts) => {
    called += 1;
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(opts.method, "POST");
    assert.equal(opts.headers.Authorization, "Bearer re_test_key");
    assert.ok(opts.signal);
    const body = JSON.parse(opts.body);
    assert.equal(body.from, FROM);
    assert.equal(body.to, "lab@apex.example");
    assert.match(body.subject, /Qtech Service Desk/);
    assert.match(body.text, /123456/);
    assert.match(body.html, /123456/);
    assert.equal(opts.body.includes("re_test_key"), false);
    return mockRes(200, { id: "msg_1" });
  };
  await deliverOtp(notify, { mail: "lab@apex.example", code: "123456", equip: "Pump", ttlMinutes: 10 }, { fetchFn });
  assert.equal(called, 1);
});

test("resend 403 (domain not verified) becomes a friendly 502 and logs the Resend message", async () => {
  const errors = [];
  const orig = console.error;
  console.error = (...a) => errors.push(a.join(" "));
  const fetchFn = async () => mockRes(403, { message: "The qtech.example domain is not verified." });
  try {
    await assert.rejects(
      () => sendResendEmail({ apiKey: "re_test_key", from: FROM, to: "a@b.c", subject: "s", html: "h", text: "t", fetchFn }),
      (e) => e instanceof HttpError && e.status === 502 && /Could not send the OTP/.test(e.message)
    );
  } finally {
    console.error = orig;
  }
  assert.ok(errors.some((m) => /403/.test(m) && /not verified/.test(m)));
  assert.equal(errors.some((m) => /re_test_key/.test(m)), false);
});

test("resend 429 or quota error reports the daily email limit", async () => {
  const fetchFn = async () => mockRes(429, { message: "Too many requests" });
  await assert.rejects(
    () => sendResendEmail({ apiKey: "re_test_key", from: FROM, to: "a@b.c", subject: "s", html: "h", text: "t", fetchFn }),
    (e) => e instanceof HttpError && e.status === 502 && /daily email limit/.test(e.message)
  );
  assert.match(mapResendError(403, { message: "quota exceeded" }).message, /daily email limit/);
});

test("resend timeout becomes a friendly 502", async () => {
  const fetchFn = async () => {
    const e = new Error("The operation was aborted due to timeout");
    e.name = "TimeoutError";
    throw e;
  };
  await assert.rejects(
    () => sendResendEmail({ apiKey: "re_test_key", from: FROM, to: "a@b.c", subject: "s", html: "h", text: "t", fetchFn }),
    (e) => e instanceof HttpError && e.status === 502 && /Could not send the OTP/.test(e.message)
  );
});

test("missing customer email keeps the existing 400 message", async () => {
  await assert.rejects(
    () => deliverOtp(notify, { mail: "", mobile: "9800000000", code: "111111", equip: "Pump", ttlMinutes: 10 }),
    (e) => e instanceof HttpError && e.status === 400 && /no customer email/.test(e.message)
  );
});
