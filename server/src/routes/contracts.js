import { Router } from "express";
import { config } from "../env.js";
import { Contract } from "../models/Contract.js";
import { User } from "../models/User.js";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { AMC_REASONS, AMC_STATES, DELAY_REASONS } from "../lib/constants.js";
import { todayIso } from "../lib/dates.js";
import { canAccessContract } from "../lib/policy.js";
import { buildSchedule, mkPm } from "../lib/schedule.js";
import { EMAIL_RE, isObjectId, oneOf, optDate, parseIndex, reqDate, str } from "../lib/validate.js";
import { requirePermission } from "../middleware/auth.js";
import { checkDocument, upload } from "../middleware/upload.js";
import { otpKey, verifyOtp } from "../services/otp.js";
import { removeFile, saveFile, sendStored } from "../services/storage.js";

const router = Router();

/* ---------- helpers ---------- */
// Engineers asking for a contract that is not theirs get "not found", the same answer as for an
// id that does not exist, so they cannot probe which ids are real.
async function loadContract(user, id) {
  if (!isObjectId(id)) throw new HttpError(404, "Contract not found.");
  const c = await Contract.findById(id);
  if (!c || !canAccessContract(user, c)) throw new HttpError(404, "Contract not found.");
  return c;
}

function loadPm(contract, rawIndex) {
  const i = parseIndex(rawIndex, contract.pms.length);
  if (i < 0) throw new HttpError(404, "PM not found.");
  return { i, pm: contract.pms[i] };
}

const notClosed = (pm) => {
  if (pm.state === "Closed") throw new HttpError(400, "This PM is already closed.");
};

// The "state is not Closed" test is part of the write itself, so two requests racing to
// close the same PM cannot both succeed.
async function updatePm(contract, i, fields) {
  const $set = {};
  for (const [k, v] of Object.entries(fields)) $set[`pms.${i}.${k}`] = v;
  const r = await Contract.updateOne({ _id: contract._id, [`pms.${i}.state`]: { $ne: "Closed" } }, { $set });
  if (r.matchedCount === 0) throw new HttpError(400, "This PM is already closed.");
}

async function engineerIdOrThrow(raw) {
  const id = str(raw, 40);
  if (!id) return null;
  if (!isObjectId(id) || !(await User.exists({ _id: id, role: "engineer" }))) throw new HttpError(400, "Unknown engineer.");
  return id;
}

/* ---------- read ---------- */
router.get(
  "/",
  requirePermission("listContracts"),
  asyncHandler(async (req, res) => {
    const filter = req.user.role === "engineer" ? { engineer: req.user._id } : {};
    const list = await Contract.find(filter).sort({ createdAt: 1, _id: 1 });
    res.json(list.map((c) => c.toJSON()));
  })
);

/* ---------- admin: add and validate ---------- */
router.post(
  "/",
  requirePermission("addContract"),
  asyncHandler(async (req, res) => {
    const b = req.body || {};
    const cust = str(b.cust);
    const equip = str(b.equip);
    if (!cust || !equip) throw new HttpError(400, "Enter customer and equipment.");
    const start = reqDate(b.start, "Enter a valid start date.");
    const end = reqDate(b.end, "Enter a valid end date.");
    if (end <= start) throw new HttpError(400, "End date must be after start date.");
    const mail = str(b.mail);
    if (mail && !EMAIL_RE.test(mail)) throw new HttpError(400, "Enter a valid email.");

    const c = await Contract.create({
      cust, equip, start, end, mail,
      city: str(b.city), contact: str(b.contact), mobile: str(b.mobile, 30), loc: str(b.loc),
      type: str(b.type), serial: str(b.serial),
      engineer: await engineerIdOrThrow(b.engineerId),
      pms: buildSchedule(start, end).map((d) => mkPm(d)),
    });
    res.status(201).json(c.toJSON());
  })
);

router.put(
  "/:id/validation",
  requirePermission("validateContract"),
  asyncHandler(async (req, res) => {
    const c = await loadContract(req.user, req.params.id);
    const b = req.body || {};
    const valid = oneOf(b.valid, ["Yes", "No"], "Choose Yes or No.");
    await Contract.updateOne({ _id: c._id }, { $set: { valid, vby: str(b.vby), vdue: optDate(b.vdue, "Enter a valid date.") } });
    res.json({ ok: true });
  })
);

/* ---------- coordinator: assign engineer ---------- */
router.put(
  "/:id/engineer",
  requirePermission("assignEngineer"),
  asyncHandler(async (req, res) => {
    const c = await loadContract(req.user, req.params.id);
    const engineer = await engineerIdOrThrow(req.body?.engineerId);
    await Contract.updateOne({ _id: c._id }, { $set: { engineer } });
    res.json({ ok: true });
  })
);

/* ---------- engineer: PM actions ---------- */
router.post(
  "/:id/pms/:index/ack",
  requirePermission("pmAction"),
  asyncHandler(async (req, res) => {
    const c = await loadContract(req.user, req.params.id);
    const { i, pm } = loadPm(c, req.params.index);
    notClosed(pm);
    await updatePm(c, i, { ack: true, state: "Acknowledged" });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/pms/:index/delay",
  requirePermission("pmAction"),
  asyncHandler(async (req, res) => {
    const c = await loadContract(req.user, req.params.id);
    const { i, pm } = loadPm(c, req.params.index);
    notClosed(pm);

    const b = req.body || {};
    const reason = oneOf(b.reason, DELAY_REASONS, "Choose a reason.");
    const remark = str(b.remark, 300);
    const plan = optDate(b.plan, "Enter a valid planned visit date.");
    if (!plan) throw new HttpError(400, "Enter the planned visit date.");

    if (reason === "Customer Not Available") await verifyOtp(otpKey(c.id, i), b.otp);
    await updatePm(c, i, { state: "Delayed", ack: true, reason: reason + (remark ? ": " + remark : ""), plan });
    res.json({ ok: true });
  })
);

router.post(
  "/:id/pms/:index/close",
  requirePermission("pmAction"),
  upload.single("report"),
  asyncHandler(async (req, res) => {
    const c = await loadContract(req.user, req.params.id);
    const { i, pm } = loadPm(c, req.params.index);
    notClosed(pm);

    if (!req.file) throw new HttpError(400, "Attach the service report.");
    const doc = checkDocument(req.file);
    await verifyOtp(otpKey(c.id, i), req.body?.otp);

    const key = await saveFile(doc.buffer, doc.ext);
    try {
      await updatePm(c, i, { state: "Closed", done: todayIso(config.tz), reason: "Report: " + doc.name, reportFile: key, reportName: doc.name });
    } catch (e) {
      await removeFile(key);
      throw e;
    }
    res.json({ ok: true });
  })
);

/* ---------- AMC follow-up ---------- */
router.put(
  "/:id/amc",
  requirePermission("updateAmc"),
  upload.single("doc"),
  asyncHandler(async (req, res) => {
    const c = await loadContract(req.user, req.params.id);
    const b = req.body || {};

    const state = oneOf(b.state, AMC_STATES, "Choose an outcome.");
    const reason = oneOf(b.reason ?? "", AMC_REASONS, "Choose a valid reason.");
    const remark = str(b.remark, 500);
    const date = optDate(b.date, "Enter a valid date.");
    const file = req.file ? checkDocument(req.file) : null;

    if ((state === "Delayed" || state === "Refusal") && !reason) throw new HttpError(400, "Choose a reason.");
    if (state === "Delayed" && !date) throw new HttpError(400, "Enter the date the cheque will be received.");
    if (state === "Accepted" && !file && !c.amc.doc) throw new HttpError(400, "Attach the AMC document and cheque.");

    if (state === "Accepted" || reason === "Customer Not Available" || reason === "Customer Not Agreed") {
      await verifyOtp(otpKey(c.id), b.otp);
    }

    const oldKey = c.amc.docFile;
    let doc = c.amc.doc || "";
    let docFile = oldKey || "";
    let newKey = "";
    if (file) {
      newKey = await saveFile(file.buffer, file.ext);
      doc = file.name;
      docFile = newKey;
    }
    try {
      await Contract.updateOne({ _id: c._id }, { $set: { amc: { state, reason, remark, date, doc, docFile } } });
    } catch (e) {
      if (newKey) await removeFile(newKey);
      throw e;
    }
    if (newKey && oldKey) await removeFile(oldKey);
    res.json({ ok: true });
  })
);

/* ---------- downloads (same access rule as the contract itself) ---------- */
router.get(
  "/:id/pms/:index/report",
  asyncHandler(async (req, res, next) => {
    const c = await loadContract(req.user, req.params.id);
    const { pm } = loadPm(c, req.params.index);
    sendStored(res, next, pm.reportFile, pm.reportName);
  })
);

router.get(
  "/:id/amc/document",
  asyncHandler(async (req, res, next) => {
    const c = await loadContract(req.user, req.params.id);
    sendStored(res, next, c.amc.docFile, c.amc.doc);
  })
);

export default router;
