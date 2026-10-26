import { useData } from "../context/DataContext";
import { pmRowClass } from "../lib/pm";
import { Empty, ReminderTag, Tag } from "./ui";

// rows: [{ c: contract, p: pm, i: index }]   action(row) renders the buttons
export default function PmTable({ rows, action }) {
  const { engName } = useData();
  if (!rows.length) return <Empty>No PM visits here.</Empty>;

  return (
    <div className="scroll">
      <table>
        <thead>
          <tr>
            <th>PM date</th>
            <th>Machine</th>
            <th>Customer</th>
            <th>Engineer</th>
            <th>Status</th>
            <th>Reminder</th>
            {action && <th />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const { c, p, i } = row;
            return (
              <tr key={c.id + ":" + i} className={pmRowClass(p)}>
                <td>{p.date}</td>
                <td>
                  {c.equip}
                  <div className="note">
                    {c.serial}, PM {i + 1} of {c.pms.length}
                  </div>
                </td>
                <td>
                  {c.cust}
                  <div className="note">{c.city}</div>
                </td>
                <td>{engName(c.engineerId)}</td>
                <td>
                  <Tag>{p.state}</Tag>
                  {p.reason && (
                    <div className="note">
                      {p.reason}
                      {p.plan ? ", new date " + p.plan : ""}
                    </div>
                  )}
                  {p.hasReport && (
                    <div className="note">
                      <a href={`/api/contracts/${encodeURIComponent(c.id)}/pms/${i}/report`} download>
                        Download service report
                      </a>
                    </div>
                  )}
                </td>
                <td>
                  <ReminderTag date={p.date} acknowledged={p.ack} />
                </td>
                {action && <td>{action(row)}</td>}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
