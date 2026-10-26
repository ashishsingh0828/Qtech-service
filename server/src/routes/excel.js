import { Router } from "express";
import { config } from "../env.js";
import { Contract } from "../models/Contract.js";
import { User } from "../models/User.js";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { todayIso } from "../lib/dates.js";
import { MAX_IMPORT_ROWS, buildExport, dupKey, parseSheet } from "../lib/excelMap.js";
import { extOf, sniffMatches } from "../lib/sniff.js";
import { requirePermission } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { XLSX_MIME, readMatrix, writeWorkbook } from "../services/excel.js";

const router = Router();
router.use(requirePermission("excel"));

router.post(
  "/import",
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw new HttpError(400, "Choose an Excel file first.");

    const ext = extOf(file.originalname);
    if (ext === "xls") throw new HttpError(400, "Old .xls files are not supported. Open it in Excel and save it as .xlsx.");
    if (ext !== "xlsx" && ext !== "csv") throw new HttpError(400, "Upload an .xlsx or .csv file.");
    if (ext === "xlsx" && !sniffMatches("xlsx", file.buffer)) throw new HttpError(400, "That is not a valid .xlsx workbook.");

    const matrix = await readMatrix(file.buffer, ext);
    if (matrix.length > MAX_IMPORT_ROWS + 10) throw new HttpError(400, `That sheet has more than ${MAX_IMPORT_ROWS} rows. Split it and upload in parts.`);

    const engineers = await User.find({ role: "engineer" });
    const byName = new Map(engineers.map((u) => [u.name.toLowerCase(), String(u._id)]));

    let parsed;
    try {
      parsed = parseSheet(matrix, byName);
    } catch (e) {
      if (e.code === "NO_HEADER") throw new HttpError(400, e.message);
      throw e;
    }

    // A row is a duplicate if customer + equipment + serial + start date already exist,
    // in the database or earlier in this same file.
    const have = new Set((await Contract.find({}, "cust equip serial start").lean()).map(dupKey));
    const fresh = [];
    let skipped = 0;
    for (const c of parsed.contracts) {
      const k = dupKey(c);
      if (have.has(k)) skipped++;
      else {
        have.add(k);
        fresh.push({ ...c, engineer: c.engineerId || null });
      }
    }
    if (fresh.length) await Contract.insertMany(fresh);

    res.json({ imported: fresh.length, skipped, unreadable: parsed.unreadable });
  })
);

router.get(
  "/export",
  asyncHandler(async (_req, res) => {
    const [contracts, users] = await Promise.all([Contract.find().sort({ createdAt: 1, _id: 1 }), User.find()]);
    const names = new Map(users.map((u) => [String(u._id), u.name]));
    const sheet = buildExport(contracts.map((c) => c.toJSON()), names, todayIso(config.tz));
    const buf = await writeWorkbook(sheet);

    res.set({
      "Content-Type": XLSX_MIME,
      "Content-Disposition": 'attachment; filename="Engineer_Service_Data.xlsx"',
      "Cache-Control": "no-store",
    });
    res.send(buf);
  })
);

export default router;
