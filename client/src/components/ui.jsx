import { daysLeft } from "../lib/dates";
import { reminderFor } from "../lib/reminders";

export const PageHeader = ({ title, text }) => (
  <div className="pg">
    <h1>{title}</h1>
    {text && <p>{text}</p>}
  </div>
);

export const Panel = ({ title, actions, children }) => (
  <section className="panel">
    {(title || actions) && (
      <div className="panel-head">
        {title && <h2>{title}</h2>}
        {actions}
      </div>
    )}
    {children}
  </section>
);

export const Stat = ({ value, label, tone = "" }) => (
  <div className={"stat " + tone}>
    <b>{value}</b>
    <span>{label}</span>
  </div>
);

export const Tag = ({ tone = "", children }) => <span className={"tag " + tone}>{children}</span>;

export const Empty = ({ children }) => <p className="empty">{children}</p>;

export function ReminderTag({ date, acknowledged, kind }) {
  const r = reminderFor(date, acknowledged, kind);
  if (!r) return <span className="note">No reminder yet</span>;
  return (
    <Tag tone={r.level}>
      Reminder {r.n}, {r.label}: {r.to}
    </Tag>
  );
}

export function LeftTag({ end }) {
  const d = daysLeft(end);
  const tone = d < 0 ? "bad" : d <= 60 ? "warn" : "ok";
  const width = d < 0 ? 100 : Math.max(4, Math.min(100, (d / 365) * 100));
  return (
    <>
      <Tag tone={tone}>{d < 0 ? `Expired ${-d}d ago` : `${d}d left`}</Tag>
      <span className={"run " + tone} aria-hidden="true">
        <i style={{ width: width + "%" }} />
      </span>
    </>
  );
}
