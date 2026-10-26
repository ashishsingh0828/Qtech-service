import { useData } from "../context/DataContext";
import { daysLeft } from "../lib/dates";
import { Empty, LeftTag, ReminderTag, Tag } from "./ui";

export default function AmcTable({ contracts, onUpdate }) {
  const { engName } = useData();
  if (!contracts.length) return <Empty>No AMC follow-ups due. They appear 45 days before a contract ends.</Empty>;

  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>Customer</th>
            <th>Machine</th>
            <th>Contract ends</th>
            <th>AMC follow-up</th>
            <th>Reminder</th>
            {onUpdate && <th />}
          </tr>
        </thead>
        <tbody>
          {contracts.map((c) => {
            const a = c.amc;
            const tone = a.state === "Accepted" ? "ok" : a.state === "Refusal" ? "bad" : a.state === "Delayed" ? "warn" : "";
            const row = a.state === "Accepted" ? "st-done" : daysLeft(c.end) < 0 ? "st-late" : "st-open";
            return (
              <tr key={c.id} className={row}>
                <td>
                  {c.cust}
                  <div className="note">
                    {c.contact}, {c.mobile}
                  </div>
                </td>
                <td>
                  {c.equip}
                  <div className="note">
                    {c.type}, {engName(c.engineerId)}
                  </div>
                </td>
                <td>
                  {c.end}
                  <LeftTag end={c.end} />
                </td>
                <td>
                  <Tag tone={tone}>{a.state}</Tag>
                  {a.reason && (
                    <div className="note">
                      {a.reason}
                      {a.remark ? ": " + a.remark : ""}
                    </div>
                  )}
                  {a.date && <div className="note">Cheque date {a.date}</div>}
                  {a.doc && (
                    <div className="note">
                      Attached:{" "}
                      <a href={`/api/contracts/${encodeURIComponent(c.id)}/amc/document`} download>
                        {a.doc}
                      </a>
                    </div>
                  )}
                </td>
                <td>{a.state === "Accepted" ? null : <ReminderTag date={c.end} acknowledged={a.state !== "Pending"} kind="amc" />}</td>
                {onUpdate && (
                  <td>
                    <button className="btn alt" onClick={() => onUpdate(c)}>
                      Update
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
