export const DAY = 864e5;

export const today = () => new Date(new Date().toDateString()).getTime();
export const toMs = (s) => new Date(s + "T00:00:00").getTime();

export const toIso = (t) => {
  const d = new Date(t);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
};

export const offsetIso = (n) => toIso(today() + n * DAY);
export const addDays = (s, n) => toIso(toMs(s) + n * DAY);
export const daysLeft = (end) => Math.round((toMs(end) - today()) / DAY);

export const monthTitle = (key) =>
  new Date(key + "-01T00:00:00").toLocaleString("en-IN", { month: "long", year: "numeric" });
