import { daysLeft, offsetIso } from "./dates";

export const flattenPms = (contracts) =>
  contracts.flatMap((c) => c.pms.map((p, i) => ({ c, p, i })));

export const openPms = (contracts) =>
  flattenPms(contracts)
    .filter((x) => x.p.state !== "Closed")
    .sort((a, b) => (a.p.date < b.p.date ? -1 : a.p.date > b.p.date ? 1 : 0));

export const isOverdue = (p) => p.state !== "Closed" && p.date < offsetIso(0);

export const pmRowClass = (p) =>
  p.state === "Closed" ? "st-done" : isOverdue(p) ? "st-late" : p.state === "Acknowledged" ? "st-run" : "st-open";

// AMC follow-up starts 45 days before the contract ends
export const amcList = (contracts) =>
  contracts.filter((c) => daysLeft(c.end) <= 45 || c.amc.state !== "Pending");
