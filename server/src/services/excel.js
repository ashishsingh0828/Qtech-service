import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { HttpError } from "../lib/errors.js";
import { SHEET_NAME, isDateHeader, normalizeCell } from "../lib/excelMap.js";
import { isIsoDate } from "../lib/dates.js";

export const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// File bytes -> array of rows of plain values
export async function readMatrix(buffer, ext) {
  const wb = new ExcelJS.Workbook();
  let ws;
  try {
    if (ext === "csv") {
      // exceljs normally guesses types: it reads 04-03-2026 month-first and turns "00123" into 123.
      // Return the raw text instead and let excelMap.parseDate decide (day first).
      ws = await wb.csv.read(Readable.from([buffer], { objectMode: false }), { map: (v) => (v === "" ? null : v) });
    } else {
      await wb.xlsx.load(buffer);
      ws = wb.worksheets.find((w) => /data/i.test(w.name)) || wb.worksheets[0];
    }
  } catch {
    throw new HttpError(400, "Could not read that file. Use the data handling sheet layout.");
  }
  if (!ws) throw new HttpError(400, "That workbook has no sheets.");

  const matrix = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    matrix.push(Array.from(row.values).slice(1).map(normalizeCell));
  });
  return matrix;
}

// { groups, head, rows } -> xlsx bytes. ISO date strings become real Excel dates.
export async function writeWorkbook({ groups, head, rows }) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(SHEET_NAME, { views: [{ state: "frozen", ySplit: 2 }] });
  const dateCol = head.map(isDateHeader);

  ws.addRow(groups).font = { bold: true };
  ws.addRow(head).font = { bold: true };
  for (const r of rows) {
    const row = ws.addRow(r.map((v, i) => (dateCol[i] && isIsoDate(v) ? new Date(v + "T00:00:00Z") : v)));
    dateCol.forEach((isDate, i) => {
      if (isDate) row.getCell(i + 1).numFmt = "dd-mm-yyyy";
    });
  }
  head.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.max(12, Math.min(28, h.length + 4));
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
