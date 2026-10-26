import { DAY, today, toMs } from "./dates";

// Days relative to the due date on which a reminder goes out
const LADDER = [-45, -30, -20, -15, -10, -7, -5, -3, -2, -1, 0, 0, 1, 2, 3, 4, 5, 6, 7];
// Reminders skipped once the engineer has acknowledged the visit
const SUPPRESSED = [-30, -20, -15, -10];

export function reminderFor(date, acknowledged, kind = "pm") {
  const t = Math.round((today() - toMs(date)) / DAY);
  let last = null;
  let n = 0;

  LADDER.forEach((offset, i) => {
    if (offset <= t && !(acknowledged && SUPPRESSED.includes(offset))) {
      last = offset;
      n = i + 1;
    }
  });
  if (last === null) return null;

  return {
    n,
    label: last < 0 ? -last + "d before" : last === 0 ? "due date" : last + "d after",
    to:
      last >= 7
        ? "HOD"
        : last >= 1 && last <= 5
        ? "Sr. Engineer / Manager"
        : kind === "amc"
        ? "Customer and Engineer"
        : "Engineer",
    level: last >= 7 ? "bad" : last >= 1 ? "warn" : "",
  };
}
