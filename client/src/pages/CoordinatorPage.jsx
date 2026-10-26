import * as api from "../api";
import { useData } from "../context/DataContext";
import { ROLE_INFO } from "../lib/constants";
import { monthTitle } from "../lib/dates";
import { isOverdue, openPms } from "../lib/pm";
import PmTable from "../components/PmTable";
import { Empty, PageHeader, Panel, Stat } from "../components/ui";

export default function CoordinatorPage() {
  const { contracts, engineers, quick } = useData();
  const open = openPms(contracts);

  const groups = {};
  open.forEach((x) => {
    const key = x.p.date.slice(0, 7);
    (groups[key] = groups[key] || []).push(x);
  });

  return (
    <>
      <PageHeader title="Monthly PM calendar" text={ROLE_INFO.coordinator[1]} />

      <div className="stats">
        <Stat value={open.length} label="Open PMs" />
        <Stat value={open.filter((x) => isOverdue(x.p)).length} label="Overdue PMs" tone="late" />
        <Stat value={open.filter((x) => !x.c.engineerId).length} label="Not assigned" tone="soon" />
      </div>

      {!open.length && (
        <Panel>
          <Empty>No open PM visits.</Empty>
        </Panel>
      )}

      {Object.keys(groups)
        .sort()
        .map((m) => (
          <Panel key={m} title={monthTitle(m)}>
            <PmTable
              rows={groups[m]}
              action={({ c }) => (
                <select
                  aria-label={"Assign engineer for " + c.equip}
                  value={c.engineerId || ""}
                  onChange={(e) => quick(() => api.assignEngineer(c.id, e.target.value), "Engineer assigned.")}
                >
                  <option value="">Assign...</option>
                  {engineers.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name}
                    </option>
                  ))}
                </select>
              )}
            />
          </Panel>
        ))}
    </>
  );
}
