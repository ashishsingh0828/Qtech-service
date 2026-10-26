// All dates in the system are plain "YYYY-MM-DD" strings (no time zones to get wrong).
export const DAY = 864e5;

export function isIsoDate(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const toMs = (iso) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};
export const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);
export const addDays = (iso, n) => fromMs(toMs(iso) + n * DAY);
export const daysLeft = (endIso, todayIso) => Math.round((toMs(endIso) - toMs(todayIso)) / DAY);

// "today" in the business time zone, not the server's
export function todayIso(tz = "Asia/Kolkata", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

// Excel stores dates as days since 1899-12-30
export const serialToIso = (serial) => fromMs(Math.round((serial - 25569) * DAY));
