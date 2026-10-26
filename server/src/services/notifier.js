import { config } from "../env.js";
import { HttpError } from "../lib/errors.js";

let transport;
async function getTransport() {
  if (!transport) {
    const { default: nodemailer } = await import("nodemailer");
    const { host, port, user, pass } = config.notify.smtp;
    transport = nodemailer.createTransport({ host, port, secure: port === 465, auth: user ? { user, pass } : undefined });
  }
  return transport;
}

// Sends the OTP to the CUSTOMER (the contact stored on the contract), never to the
// engineer who asked for it. That is the whole point of the check.
export async function sendOtpMessage({ mobile, mail, code, equip, ttlMinutes }) {
  const body =
    `Your Qtech Service Desk verification code is ${code}.\n\n` +
    `Give this code to the engineer only if the service has been done or the visit was agreed. ` +
    `Equipment: "${equip}". It is valid for ${ttlMinutes} minutes.`;

  if (config.notify.provider === "console") {
    console.log(`[OTP dev] mobile=${mobile || "-"} mail=${mail || "-"} code=${code}`);
    return;
  }

  // TODO(SMS): add the SMS gateway here once we know which one you use (needs DLT registration in India).
  if (!mail) throw new HttpError(400, "This contract has no customer email to send the OTP to. Add one, or set up SMS.");
  try {
    await (await getTransport()).sendMail({ from: config.notify.smtp.from, to: mail, subject: "Your Qtech Service Desk verification code", text: body });
  } catch (e) {
    console.error("OTP email failed:", e.message);
    throw new HttpError(502, "Could not send the OTP to the customer. Try again.");
  }
}
