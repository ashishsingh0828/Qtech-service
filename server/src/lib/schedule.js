import { MAX_PMS } from "./constants.js";
import { addDays, toMs, DAY } from "./dates.js";

// One PM roughly every 6 months, first one 150 days in, same rule as the step 1 demo.
export function buildSchedule(start, end) {
  const count = Math.max(0, Math.min(MAX_PMS, Math.round((toMs(end) - toMs(start)) / DAY / 182.5)));
  return Array.from({ length: count }, (_, i) => addDays(start, 150 + 183 * i));
}

export const mkPm = (date, done = "") => ({
  date,
  done,
  state: done ? "Closed" : "Scheduled",
  ack: false,
  reason: "",
  plan: "",
});
