import test from "node:test";
import assert from "node:assert/strict";
import { addDays, daysLeft, isIsoDate, serialToIso, todayIso } from "../../src/lib/dates.js";
import { buildSchedule, mkPm } from "../../src/lib/schedule.js";

test("isIsoDate accepts real dates only", () => {
  assert.equal(isIsoDate("2026-02-28"), true);
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2026-02-29"), false);
  assert.equal(isIsoDate("2026-13-01"), false);
  assert.equal(isIsoDate("26-01-01"), false);
  assert.equal(isIsoDate("2026-1-1"), false);
  assert.equal(isIsoDate(20260101), false);
  assert.equal(isIsoDate({ $gt: "" }), false);
});

test("date arithmetic is exact across month and year ends", () => {
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysLeft("2026-11-01", "2026-10-22"), 10);
  assert.equal(daysLeft("2026-10-01", "2026-10-22"), -21);
});

test("todayIso uses the business time zone, not UTC", () => {
  const lateUtc = new Date("2026-10-21T20:00:00Z"); // already 22 Oct, 01:30 in India
  assert.equal(todayIso("Asia/Kolkata", lateUtc), "2026-10-22");
  assert.equal(todayIso("UTC", lateUtc), "2026-10-21");
});

test("Excel serial numbers convert to the right day", () => {
  assert.equal(serialToIso(25569), "1970-01-01");
  assert.equal(serialToIso(45000), "2023-03-15");
});

test("PM schedule: one visit about every 6 months, first at day 150, max 15", () => {
  assert.deepEqual(buildSchedule("2026-01-01", "2027-01-01"), [addDays("2026-01-01", 150), addDays("2026-01-01", 333)]);
  assert.equal(buildSchedule("2026-01-01", "2026-01-01").length, 0);
  assert.equal(buildSchedule("2020-01-01", "2040-01-01").length, 15);
});

test("mkPm marks a PM with a done date as Closed", () => {
  assert.equal(mkPm("2026-05-01").state, "Scheduled");
  assert.equal(mkPm("2026-05-01", "2026-05-03").state, "Closed");
});
