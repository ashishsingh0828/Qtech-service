import mongoose from "mongoose";

// One row per (contract, PM) or (contract, AMC). Holds only a hash of the code.
// The row lives for an hour so the resend limits survive after the code itself expires.
const OtpSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  codeHash: { type: String, default: null }, // null once used or revoked
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  sendCount: { type: Number, default: 1 },
  firstSentAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
  purgeAt: { type: Date, required: true, index: { expires: 0 } },
});

export const Otp = mongoose.models.Otp || mongoose.model("Otp", OtpSchema);
