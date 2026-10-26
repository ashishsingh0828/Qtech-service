import { Router } from "express";
import bcrypt from "bcryptjs";
import { config } from "../env.js";
import { User, publicUser } from "../models/User.js";
import { Contract } from "../models/Contract.js";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { ROLES } from "../lib/constants.js";
import { EMAIL_RE, isObjectId, str } from "../lib/validate.js";
import { requirePermission } from "../middleware/auth.js";

const router = Router();

router.get(
  "/engineers",
  requirePermission("listEngineers"),
  asyncHandler(async (_req, res) => {
    const list = await User.find({ role: "engineer" }).sort({ name: 1 });
    res.json(list.map((u) => ({ id: String(u._id), name: u.name })));
  })
);

router.get(
  "/",
  requirePermission("manageUsers"),
  asyncHandler(async (_req, res) => {
    res.json((await User.find().sort({ createdAt: 1 })).map(publicUser));
  })
);

router.post(
  "/",
  requirePermission("manageUsers"),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100);
    const email = str(b.email, 200).toLowerCase();
    const role = typeof b.role === "string" ? b.role : "";
    const password = typeof b.password === "string" ? b.password : "";

    if (!name) throw new HttpError(400, "Enter a name.");
    if (!EMAIL_RE.test(email)) throw new HttpError(400, "Enter a valid email.");
    if (!ROLES.includes(role)) throw new HttpError(400, "Choose a role.");
    // bcrypt only reads the first 72 bytes, so longer passwords would be silently cut
    if (password.length < 8 || Buffer.byteLength(password) > 72) throw new HttpError(400, "Password must be 8 to 72 characters.");
    if (await User.exists({ email })) throw new HttpError(400, "That email is already in use.");

    const user = await User.create({ name, email, role, passwordHash: await bcrypt.hash(password, config.bcryptRounds) });
    res.status(201).json({ user: publicUser(user) });
  })
);

router.put(
  "/:id",
  requirePermission("manageUsers"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw new HttpError(404, "User not found.");
    const target = await User.findById(id);
    if (!target) throw new HttpError(404, "User not found.");

    const b = req.body || {};
    const $set = {};
    if (b.name !== undefined) {
      const name = str(b.name, 100);
      if (!name) throw new HttpError(400, "Enter a name.");
      $set.name = name;
    }
    let roleChanged = false;
    if (b.role !== undefined && b.role !== target.role) {
      if (!ROLES.includes(b.role)) throw new HttpError(400, "Choose a role.");
      // An admin cannot demote themselves: that could leave nobody able to manage users.
      if (id === String(req.user._id)) throw new HttpError(400, "You cannot change your own role.");
      $set.role = b.role;
      roleChanged = true;
    }
    if (typeof b.password === "string" && b.password !== "") {
      if (b.password.length < 8 || Buffer.byteLength(b.password) > 72) throw new HttpError(400, "Password must be 8 to 72 characters.");
      $set.passwordHash = await bcrypt.hash(b.password, config.bcryptRounds);
      $set.failedLogins = 0;
      $set.lockUntil = null;
      $set.sessionsValidFrom = new Date();
    }
    if (!Object.keys($set).length) throw new HttpError(400, "Nothing to change.");

    await User.updateOne({ _id: id }, { $set });
    // Someone who is no longer an engineer cannot keep engineer assignments.
    if (roleChanged && target.role === "engineer") await Contract.updateMany({ engineer: id }, { $set: { engineer: null } });
    res.json({ user: publicUser(await User.findById(id)) });
  })
);

router.delete(
  "/:id",
  requirePermission("manageUsers"),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!isObjectId(id)) throw new HttpError(404, "User not found.");
    if (id === String(req.user._id)) throw new HttpError(400, "You cannot delete your own account.");

    const target = await User.findById(id);
    if (!target) throw new HttpError(404, "User not found.");
    if (target.role === "admin" && (await User.countDocuments({ role: "admin" })) <= 1) {
      throw new HttpError(400, "You cannot delete the last admin.");
    }

    await User.deleteOne({ _id: id });
    await Contract.updateMany({ engineer: id }, { $set: { engineer: null } }); // their contracts become unassigned
    res.json({ ok: true });
  })
);

export default router;
