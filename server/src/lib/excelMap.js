// Excel <-> contract mapping. No file I/O here (exceljs lives in services/excel.js),
// so the whole layout can be tested without any library.
import { CONTRACT_TYPES, MAX_PMS } from "./constants.js";
import { DAY, daysLeft, isIsoDate, serialToIso } from "./dates.js";
import { buildSchedule, mkPm } from "./schedule.js";

export const SHEET_NAME = "data handling";
export const MAX_IMPORT_ROWS = 5000;

const BASE_HEAD = [
  "SR. No", "Customer Name", "City", "Name", "Mobile No", "Mail", "Location", "Contract Type",
  "Euipment Name", "Serial NO", "Start Date", "Month", "Year", "End Date", "Status", "Final Status",
  "Validated (Yes/No)", "Validated by", "By when Data will be validated", "Days", "Total PMS",
];

// Extra columns from the live "customer handling for service" workbook (typos included).
const TAIL_HEAD = [
  "Breakdown Calls 1", "Breakdown Calls 2", "Breakdown Calls 3", "Breakdown Calls 4", "Breakdown Calls 5",
  "AMC", "Follow up", "Validated", "Validated at", "Rejection reason", "Verified", "Verified by", "Verified at",
  "Warranty live", "Next due PMS", "Proposal sent at", "Ack response", "Ack note", "Ack at", "Open calls", "Last call date",
  "Engineer",
];

export function exportHeaders() {
  const head = [...BASE_HEAD];
  for (let n = 1; n <= MAX_PMS; n++) {
    head.push("PMS " + n);
    if (n === 1) head.push("PM Date", "PM Date 1");
    else if (n < MAX_PMS) head.push("PM Date" + n);
    else head.push("Compaint", "PM Date 15");
  }
  head.push(...TAIL_HEAD);
  return head;
}

export const isDateHeader = (h) =>
  /^(start date|end date|by when data will be validated|pms \d+|pm date\s*\d*|next due pms|last call date|validated at|verified at|proposal sent at|ack at)$/i.test(h);

/* ---------- export ---------- */
// contracts: the JSON shape the API returns. nameById: Map(userId -> name).
export function buildExport(contracts, nameById, today) {
  const head = exportHeaders();
  const groups = head.map(() => "");
  groups[0] = "Customer Detail";
  groups[7] = "Instrument Details";
  groups[16] = "Data Validation";
  groups[20] = "Schedule Services";

  const rows = contracts.map((c, i) => {
    const days = Math.round((Date.parse(c.end) - Date.parse(c.start)) / DAY);
    const status = daysLeft(c.end, today) < 0 ? "Expired" : "Active";
    const r = [
      i + 1, c.cust, c.city, c.contact, c.mobile, c.mail, c.loc, c.type, c.equip, c.serial,
      c.start, Number(c.end.slice(5, 7)), Number(c.end.slice(0, 4)), c.end,
      status, status + " - " + c.type, c.valid, c.vby, c.vdue, days, +(days / 182.5).toFixed(2),
    ];
    for (let n = 0; n < MAX_PMS; n++) {
      const p = c.pms[n];
      r.push(p ? p.date : "NA");
      if (n === 0) {
        r.push(p ? p.done || "NA" : "NA");
        r.push(""); // PM Date 1 (kept for the live 74-column sheet)
      } else if (n < MAX_PMS - 1) {
        r.push(p ? p.done || "NA" : "NA");
      } else {
        r.push(""); // Compaint
        r.push(p ? p.done || "NA" : "NA");
      }
    }
    r.push(
      "", "", "", "", "",
      c.amc?.state && c.amc.state !== "Pending" ? c.amc.state : status === "Expired" ? "AMC Due" : "",
      "", "", "", "", "", "", "",
      status === "Expired" ? "Expired" : "Active",
      c.pms[0]?.date || "",
      "", "", "", "",
      "",
      "",
      nameById.get(c.engineerId) || ""
    );
    return r;
  });
  return { groups, head, rows };
}

/* ---------- import ---------- */
const nk = (k) => String(k ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const clip = (s, n = 200) => String(s).trim().slice(0, n);

// exceljs returns rich text, formulas and hyperlinks as objects. Flatten them.
export function normalizeCell(v) {
  if (v == null) return "";
  if (v instanceof Date || typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if (Array.isArray(v.richText)) return v.richText.map((t) => t.text).join("").trim();
    if ("result" in v) return normalizeCell(v.result);
    if ("text" in v) return normalizeCell(v.text);
    if ("error" in v) return "";
  }
  return "";
}

export function parseDate(v) {
  if (v === "" || v == null) return "";
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  if (typeof v === "number") return v > 20000 ? serialToIso(v) : "";
  const s = String(v).trim();
  let m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return isIsoDate(m[1]) ? m[1] : "";
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); // day first (India)
  if (!m) return "";
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return isIsoDate(iso) ? iso : "";
}

function text(v) {
  if (v instanceof Date) return parseDate(v);
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(+v.toFixed(6));
  return String(v ?? "");
}

export const dupKey = (c) => [c.cust, c.equip, c.serial, c.start].map((x) => String(x ?? "").trim().toLowerCase()).join("|");

// matrix: array of rows, each an array of normalized cell values.
// engineerByName: Map(lowercase name -> user id).
export function parseSheet(matrix, engineerByName) {
  const headerAt = matrix.slice(0, 10).findIndex((r) => r.some((c) => nk(c) === "customername"));
  if (headerAt === -1) {
    const e = new Error("Could not find the header row. Use the data handling sheet layout (it needs a Customer Name column).");
    e.code = "NO_HEADER";
    throw e;
  }
  const keys = matrix[headerAt].map(nk);
  const contracts = [];
  let unreadable = 0;

  for (const row of matrix.slice(headerAt + 1)) {
    if (!row.some((c) => c !== "" && c != null)) continue; // blank line

    const m = {};
    keys.forEach((k, i) => {
      const v = row[i] ?? "";
      if (k && (m[k] === undefined || m[k] === "")) m[k] = v;
    });
    const g = (...ks) => {
      for (const k of ks) if (m[k] !== undefined && m[k] !== "") return m[k];
      return "";
    };

    const cust = clip(text(g("customername")));
    const start = parseDate(g("startdate"));
    const end = parseDate(g("enddate"));
    if (!cust || !start || !end || end < start) {
      unreadable++;
      continue;
    }

    const pms = [];
    for (let n = 1; n <= MAX_PMS; n++) {
      const planned = parseDate(g("pms" + n));
      if (planned) pms.push(mkPm(planned, parseDate(g(n === 1 ? "pmdate" : "pmdate" + n))));
    }

    const typeText = clip(text(g("contracttype")));
    const engineerName = text(g("engineer")).trim().toLowerCase();
    contracts.push({
      cust,
      city: clip(text(g("city"))),
      contact: clip(text(g("name"))),
      mobile: clip(text(g("mobileno")), 30),
      mail: clip(text(g("mail"))),
      loc: clip(text(g("location"))),
      type: CONTRACT_TYPES.find((t) => t.toLowerCase() === typeText.toLowerCase()) || typeText,
      equip: clip(text(g("euipmentname", "equipmentname"))),
      serial: clip(text(g("serialno"))),
      start,
      end,
      valid: /^y/i.test(text(g("validatedyesno"))) ? "Yes" : "No",
      vby: clip(text(g("validatedby"))),
      vdue: parseDate(g("bywhendatawillbevalidated")),
      engineerId: engineerByName.get(engineerName) || "",
      pms: pms.length ? pms : buildSchedule(start, end).map((d) => mkPm(d)),
    });
  }
  return { contracts, unreadable };
}
