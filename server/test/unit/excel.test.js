import test from "node:test";
import assert from "node:assert/strict";
import { buildExport, dupKey, isDateHeader, normalizeCell, parseDate, parseSheet } from "../../src/lib/excelMap.js";
import { isIsoDate } from "../../src/lib/dates.js";

const contract = (o) => ({
  id: "c1", engineerId: "", valid: "No", vby: "", vdue: "", loc: "", mobile: "", mail: "", contact: "", city: "", serial: "",
  ...o,
});

// Mimic what the Excel file stores: ISO strings in date columns become real Date cells (see services/excel.js)
function asFileMatrix({ groups, head, rows }) {
  const dateCol = head.map(isDateHeader);
  const body = rows.map((r) => r.map((v, i) => (dateCol[i] && isIsoDate(v) ? new Date(v + "T00:00:00Z") : v)));
  return [groups, head, ...body].map((r) => r.map(normalizeCell));
}

const sample = [
  contract({
    id: "a", cust: "Apex Labs", city: "Gurugram", contact: "Dr. Mehta", mobile: "9800000001", mail: "lab@apex.example",
    loc: "Cell Culture", type: "Warranty", equip: "CO2 Incubator", serial: "CI-2210", start: "2026-01-01", end: "2027-01-01",
    valid: "Yes", vby: "Admin", vdue: "2026-02-01", engineerId: "e1",
    pms: [
      { date: "2026-05-31", done: "2026-06-02", state: "Closed" },
      { date: "2026-11-30", done: "", state: "Scheduled" },
    ],
  }),
  contract({
    id: "b", cust: "Sunrise Clinic", type: "CMC", equip: "Incubator IN-80", serial: "", start: "2025-03-10", end: "2026-03-10",
    pms: [{ date: "2025-08-07", done: "", state: "Scheduled" }],
  }),
];
const names = new Map([["e1", "Ravi Kumar"]]);

test("export then import returns the same contracts", () => {
  const matrix = asFileMatrix(buildExport(sample, names, "2026-10-22"));
  const { contracts, unreadable } = parseSheet(matrix, new Map([["ravi kumar", "e1"]]));

  assert.equal(unreadable, 0);
  assert.equal(contracts.length, 2);
  for (const [i, want] of sample.entries()) {
    const got = contracts[i];
    for (const k of ["cust", "city", "contact", "mobile", "mail", "loc", "type", "equip", "serial", "start", "end", "valid", "vby", "vdue", "engineerId"]) {
      assert.equal(got[k], want[k], `${want.cust}.${k}`);
    }
    assert.deepEqual(got.pms.map((p) => [p.date, p.done]), want.pms.map((p) => [p.date, p.done]));
    assert.deepEqual(got.pms.map((p) => p.state), want.pms.map((p) => p.state));
  }
});

test("a second import of the same export would be seen as all duplicates", () => {
  const matrix = asFileMatrix(buildExport(sample, names, "2026-10-22"));
  const { contracts } = parseSheet(matrix, new Map());
  assert.deepEqual(contracts.map(dupKey), sample.map(dupKey));
});

test("duplicate key tolerates case and spacing, but a renewal (new start date) is different", () => {
  const a = { cust: "Apex Labs", equip: "CO2 Incubator", serial: "CI-1", start: "2026-01-01" };
  assert.equal(dupKey(a), dupKey({ ...a, cust: " apex labs ", serial: "ci-1" }));
  assert.notEqual(dupKey(a), dupKey({ ...a, start: "2027-01-01" }));
});

test("export marks expired contracts and counts PM slots", () => {
  const { head, rows } = buildExport(sample, names, "2026-10-22");
  const col = (h) => head.indexOf(h);
  assert.equal(rows[1][col("Status")], "Expired");
  assert.equal(rows[0][col("Status")], "Active");
  assert.equal(rows[0][col("Engineer")], "Ravi Kumar");
  assert.equal(rows[0][col("PMS 3")], "NA");
  assert.equal(rows[0].length, head.length);
});

test("dates are read from Excel dates, serial numbers, ISO and day-first text", () => {
  assert.equal(parseDate(new Date("2026-03-04T00:00:00Z")), "2026-03-04");
  assert.equal(parseDate(45000), "2023-03-15");
  assert.equal(parseDate("2026-03-04"), "2026-03-04");
  assert.equal(parseDate("04/03/2026"), "2026-03-04");
  assert.equal(parseDate("4-3-2026"), "2026-03-04");
  assert.equal(parseDate("31/02/2026"), "");
  assert.equal(parseDate("NA"), "");
  assert.equal(parseDate(""), "");
  assert.equal(parseDate(12), "");
});

test("cell values from rich text, formulas and links are flattened", () => {
  assert.equal(normalizeCell({ richText: [{ text: "Ap" }, { text: "ex " }] }), "Apex");
  assert.equal(normalizeCell({ formula: "A1&B1", result: "joined" }), "joined");
  assert.equal(normalizeCell({ text: "site", hyperlink: "http://x" }), "site");
  assert.equal(normalizeCell({ error: "#N/A" }), "");
  assert.equal(normalizeCell(null), "");
  assert.equal(normalizeCell("  x "), "x");
});

test("rows with missing or backwards dates are counted as unreadable; blank lines are ignored", () => {
  const head = ["Customer Name", "Euipment Name", "Start Date", "End Date"];
  const matrix = [
    ["Customer Detail", "", "", ""],
    head,
    ["Good Co", "Pump", "2026-01-01", "2027-01-01"],
    ["", "", "", ""],
    ["No End", "Pump", "2026-01-01", ""],
    ["Backwards", "Pump", "2027-01-01", "2026-01-01"],
    ["", "Pump", "2026-01-01", "2027-01-01"],
  ];
  const r = parseSheet(matrix, new Map());
  assert.equal(r.contracts.length, 1);
  assert.equal(r.unreadable, 3);
  assert.equal(r.contracts[0].pms.length, 2); // no PMS columns, so the schedule is generated
});

test("a sheet without a Customer Name column is rejected with a clear code", () => {
  assert.throws(() => parseSheet([["a", "b"], ["1", "2"]], new Map()), (e) => e.code === "NO_HEADER");
});

test("header names are matched loosely (spacing, case, punctuation, equipment spelling)", () => {
  const matrix = [
    ["customer  NAME", "Equipment Name", "start-date", "END DATE", "Serial NO:", "Validated (Yes/No)", "Mobile No"],
    ["Zed", "Pump", "01/01/2026", "01/01/2027", 123, "yes", 9800000001],
  ];
  const { contracts } = parseSheet(matrix, new Map());
  assert.equal(contracts[0].equip, "Pump");
  assert.equal(contracts[0].serial, "123");
  assert.equal(contracts[0].valid, "Yes");
  assert.equal(contracts[0].mobile, "9800000001");
  assert.equal(contracts[0].start, "2026-01-01");
});

test("unknown engineer names leave the contract unassigned", () => {
  const matrix = [["Customer Name", "Start Date", "End Date", "Engineer"], ["Zed", "2026-01-01", "2027-01-01", "Nobody"]];
  assert.equal(parseSheet(matrix, new Map([["ravi kumar", "e1"]])).contracts[0].engineerId, "");
});

test("the live 74-column customer-handling sheet (typos included) imports and export keeps Engineer", () => {
  const { head, rows } = buildExport(sample, names, "2026-10-22");
  assert.ok(head.includes("Euipment Name"));
  assert.ok(head.includes("Compaint"));
  assert.ok(head.includes("Serial NO"));
  assert.equal(head[head.indexOf("PMS 15") + 1], "Compaint");
  assert.equal(rows[0][head.indexOf("Engineer")], "Ravi Kumar");
  assert.equal(rows[0].length, head.length);

  const liveHead = [
    "SR. No", "Customer Name", "City", "Name", "Mobile No", "Mail", "Location", "Contract Type",
    "Euipment Name", "Serial NO", "Start Date", "Month", "Year", "End Date", "Status", "Final Status",
    "Validated (Yes/No)", "Validated by", "By when Data will be validated", "Days", "Total PMS",
    "PMS 1", "PM Date", "PM Date 1", "PMS 2", "PM Date2", "PMS 3", "PM Date3", "PMS 4", "PM Date4",
    "PMS 5", "PM Date5", "PMS 6", "PM Date6", "PMS 7", "PM Date7", "PMS 8", "PM Date8", "PMS 9", "PM Date9",
    "PMS 10", "PM Date10", "PMS 11", "PM Date11", "PMS 12", "PM Date12", "PMS 13", "PM Date13",
    "PMS 14", "PM Date14", "PMS 15", "Compaint", "PM Date 15",
    "Breakdown Calls 1", "Breakdown Calls 2", "Breakdown Calls 3", "Breakdown Calls 4", "Breakdown Calls 5",
    "AMC", "Follow up", "Validated", "Validated at", "Rejection reason", "Verified", "Verified by", "Verified at",
    "Warranty live", "Next due PMS", "Proposal sent at", "Ack response", "Ack note", "Ack at", "Open calls", "Last call date",
  ];
  const liveRow = [
    7, "Translational Health", "Faridabad", "Santosh", "8700412914", "lab@thsti.example", "2nd Floor",
    "EXTENDED WARRANTY", "CO2 Incubator", "42656221", "07/04/2023", 4, 2024, "06/04/2024",
    "Expired", "Expired - EXTENDED WARRANTY", "", "", "", 365, 2,
    "04/09/2023", "NA", "NA", "05/03/2024", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA",
    "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA", "NA",
    "", "NA", "", "", "", "", "", "AMC Due", "", "", "", "", "", "", "", "Expired", "04/09/2023",
    "", "", "", "", 0, "",
  ];
  const { contracts, unreadable } = parseSheet([["Customer Detail"], liveHead, liveRow], new Map());
  assert.equal(unreadable, 0);
  assert.equal(contracts.length, 1);
  assert.equal(contracts[0].cust, "Translational Health");
  assert.equal(contracts[0].equip, "CO2 Incubator");
  assert.equal(contracts[0].serial, "42656221");
  assert.equal(contracts[0].type, "Extended Warranty");
  assert.equal(contracts[0].start, "2023-04-07");
  assert.equal(contracts[0].end, "2024-04-06");
  assert.equal(contracts[0].pms[0].date, "2023-09-04");
  assert.equal(contracts[0].pms[1].date, "2024-03-05");
});
