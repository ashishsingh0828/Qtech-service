import { config } from "../env.js";
import { Otp } from "../models/Otp.js";
import { HttpError } from "../lib/errors.js";
import { generateCode, hashCode, safeEqualHex } from "../lib/otpCrypto.js";
import { sendOtpMessage } from "./notifier.js";

export const otpKey = (contractId, pmIndex) => `${contractId}:${pmIndex ?? "amc"}`;

const HOUR = 3600e3;

export async function issueOtp({ key, contract }) {
  const o = config.otp;
  const now = new Date();
  const hourAgo = new Date(+now - HOUR);
  const code = generateCode(o.length);
  const fresh = {
    codeHash: hashCode(config.jwtSecret, key, code),
    attempts: 0,
    expiresAt: new Date(+now + o.ttlMinutes * 60e3),
    lastSentAt: now,
  };

  // Resend inside the hour: allowed only after the cooldown and under the hourly cap.
  // It is one atomic update, so parallel requests cannot slip past the limits.
  let doc = await Otp.findOneAndUpdate(
    { key, firstSentAt: { $gt: hourAgo }, sendCount: { $lt: o.maxPerHour }, lastSentAt: { $lte: new Date(+now - o.resendSeconds * 1000) } },
    { $set: fresh, $inc: { sendCount: 1 } },
    { new: true }
  );

  if (!doc) {
    const existing = await Otp.findOne({ key });
    if (existing && existing.firstSentAt > hourAgo) {
      if (existing.sendCount >= o.maxPerHour) throw new HttpError(429, "Too many OTPs requested for this item. Try again later.");
      const wait = Math.ceil((+existing.lastSentAt + o.resendSeconds * 1000 - +now) / 1000);
      throw new HttpError(429, `Please wait ${Math.max(wait, 1)} seconds before requesting another OTP.`);
    }
    try {
      doc = await Otp.findOneAndUpdate(
        existing ? { key, firstSentAt: existing.firstSentAt } : { key },
        { $set: { ...fresh, firstSentAt: now, sendCount: 1, purgeAt: new Date(+now + HOUR) } },
        { upsert: true, new: true }
      );
    } catch (e) {
      if (e.code === 11000) throw new HttpError(429, "An OTP was just requested. Try again in a moment.");
      throw e;
    }
  }

  try {
    await sendOtpMessage({ mobile: contract.mobile, mail: contract.mail, code, equip: contract.equip, ttlMinutes: o.ttlMinutes });
  } catch (e) {
    await Otp.updateOne({ key }, { $set: { codeHash: null } }); // a code nobody received must not stay valid
    throw e;
  }
  return { sent: true, ...(o.devEcho ? { demoCode: code } : {}) };
}

// A code works once, only before it expires, and only for a limited number of tries.
export async function verifyOtp(key, code) {
  const fail = () => new HttpError(400, "The OTP does not match or has expired. Send a new one and try again.");
  const given = String(code ?? "").trim();
  if (!/^\d{1,12}$/.test(given)) throw fail();

  const doc = await Otp.findOneAndUpdate(
    { key, codeHash: { $ne: null }, expiresAt: { $gt: new Date() }, attempts: { $lt: config.otp.maxAttempts } },
    { $inc: { attempts: 1 } },
    { new: true }
  );
  if (!doc) throw fail();
  if (!safeEqualHex(hashCode(config.jwtSecret, key, given), doc.codeHash)) throw fail();

  // Atomically burn the code, so two parallel requests cannot both use it.
  const burned = await Otp.findOneAndUpdate({ _id: doc._id, codeHash: doc.codeHash }, { $set: { codeHash: null } });
  if (!burned) throw fail();
}
