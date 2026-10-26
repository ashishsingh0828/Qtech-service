import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { config } from "../env.js";
import { User, publicUser } from "../models/User.js";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { str } from "../lib/validate.js";
import { clearSession, issueSession, userFromRequest } from "../middleware/auth.js";

const router = Router();

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
// Compared against when the email is unknown, so "no such user" takes as long as "wrong password".
const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", config.bcryptRounds);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.loginRateMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign-in attempts. Try again in a few minutes." },
});

router.post(
  "/login",
  loginLimiter,
  asyncHandler(async (req, res) => {
    const email = str(req.body?.email, 200).toLowerCase();
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const wrong = new HttpError(401, "Incorrect email or password.");

    const user = await User.findOne({ email }).select("+passwordHash");
    if (user?.lockUntil && user.lockUntil > new Date()) {
      throw new HttpError(429, `Too many failed attempts. Try again in ${LOCK_MINUTES} minutes.`);
    }

    const ok = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);
    if (!user || !ok) {
      if (user) {
        const u = await User.findByIdAndUpdate(user._id, { $inc: { failedLogins: 1 } }, { new: true });
        if (u.failedLogins >= MAX_FAILS) {
          await User.updateOne({ _id: u._id }, { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MINUTES * 60e3) } });
        }
      }
      throw wrong;
    }

    if (user.failedLogins || user.lockUntil) await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockUntil: null } });
    issueSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

router.post("/logout", (_req, res) => {
  clearSession(res);
  res.json({ ok: true });
});

// 200 with { user: null } when signed out, so the browser console stays quiet on first load.
router.get(
  "/me",
  asyncHandler(async (req, res) => {
    const user = await userFromRequest(req);
    res.json({ user: user ? publicUser(user) : null });
  })
);

export default router;
