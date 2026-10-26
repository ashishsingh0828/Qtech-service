import { HttpError } from "../lib/errors.js";

const RESEND_URL = "https://api.resend.com/emails";
const SEND_TIMEOUT_MS = 10000;

let transport;
async function getTransport(smtp) {
  if (!transport) {
    const { default: nodemailer } = await import("nodemailer");
    const { host, port, user, pass } = smtp;
    transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
  }
  return transport;
}

export function buildOtpEmail({ code, equip, ttlMinutes }) {
  const subject = "Your Qtech Service Desk verification code";
  const text =
    `Your Qtech Service Desk verification code is ${code}.\n\n` +
    `Equipment: ${equip || "the instrument"}\n` +
    `This code is valid for ${ttlMinutes} minutes.\n\n` +
    `Give this code to the engineer only if the service has been done or the visit was agreed.`;
  const html =
    `<p>Your Qtech Service Desk verification code is <strong>${escapeHtml(code)}</strong>.</p>` +
    `<p>Equipment: ${escapeHtml(equip || "the instrument")}<br>` +
    `This code is valid for ${ttlMinutes} minutes.</p>` +
    `<p>Give this code to the engineer only if the service has been done or the visit was agreed.</p>`;
  return { subject, text, html };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mapResendError(status, body) {
  const raw = typeof body === "string" ? body : body?.message || body?.name || "";
  const text = String(raw);
  if (status === 429 || /quota|rate limit|daily/i.test(text)) {
    return new HttpError(502, "The daily email limit was reached. Try again tomorrow.");
  }
  return new HttpError(502, "Could not send the OTP to the customer. Try again.");
}

function logResendFailure(status, body) {
  const raw = typeof body === "string" ? body : body?.message || body?.name || "unknown error";
  console.error("OTP email failed:", status, String(raw));
}

export async function sendResendEmail({ apiKey, from, to, subject, html, text, fetchFn = globalThis.fetch }) {
  let res;
  try {
    res = await fetchFn(RESEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from, to, subject, html, text }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
  } catch (e) {
    console.error("OTP email failed:", e.name === "TimeoutError" || e.name === "AbortError" ? "timeout" : e.message);
    throw new HttpError(502, "Could not send the OTP to the customer. Try again.");
  }

  if (res.ok) return;

  let body = "";
  try {
    body = await res.json();
  } catch {
    try {
      body = await res.text();
    } catch {
      body = "";
    }
  }
  logResendFailure(res.status, body);
  throw mapResendError(res.status, body);
}

export async function deliverOtp(notify, { mobile, mail, code, equip, ttlMinutes }, { fetchFn = globalThis.fetch } = {}) {
  const email = buildOtpEmail({ code, equip, ttlMinutes });

  if (notify.provider === "console") {
    console.log(`[OTP dev] mobile=${mobile || "-"} mail=${mail || "-"} code=${code}`);
    return;
  }

  // TODO(SMS): add the SMS gateway here once we know which one you use (needs DLT registration in India).
  if (!mail) throw new HttpError(400, "This contract has no customer email to send the OTP to. Add one, or set up SMS.");

  try {
    if (notify.provider === "resend") {
      await sendResendEmail({
        apiKey: notify.resend.apiKey,
        from: notify.resend.from,
        to: mail,
        subject: email.subject,
        html: email.html,
        text: email.text,
        fetchFn,
      });
      return;
    }
    await (await getTransport(notify.smtp)).sendMail({
      from: notify.smtp.from,
      to: mail,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  } catch (e) {
    if (e instanceof HttpError) throw e;
    console.error("OTP email failed:", e.message);
    throw new HttpError(502, "Could not send the OTP to the customer. Try again.");
  }
}

export async function sendTestEmail(notify, { to, fetchFn = globalThis.fetch }) {
  const subject = "Qtech Service Desk test email";
  const text = "This is a test email from Qtech Service Desk. If you received it, outbound mail is working.";
  const html = `<p>${text}</p>`;
  if (notify.provider === "console") {
    console.log(`[mail test] to=${to} subject=${subject}`);
    return;
  }
  if (notify.provider === "resend") {
    await sendResendEmail({
      apiKey: notify.resend.apiKey,
      from: notify.resend.from,
      to,
      subject,
      html,
      text,
      fetchFn,
    });
    return;
  }
  await (await getTransport(notify.smtp)).sendMail({ from: notify.smtp.from, to, subject, text, html });
}

// Sends the OTP to the CUSTOMER (the contact stored on the contract), never to the
// engineer who asked for it. That is the whole point of the check.
export async function sendOtpMessage(args) {
  const { config } = await import("../env.js");
  return deliverOtp(config.notify, args);
}
