import mongoose from "mongoose";
import { ROLES } from "../lib/constants.js";

const UserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 200 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    sessionsValidFrom: { type: Date, default: null }, // tokens issued before this are refused
  },
  { timestamps: true }
);

export const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role });

export const User = mongoose.models.User || mongoose.model("User", UserSchema);
