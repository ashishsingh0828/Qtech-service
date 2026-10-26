import { useState } from "react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { ROLE_INFO } from "../lib/constants";
import { amcList, isOverdue, openPms } from "../lib/pm";
import { offsetIso } from "../lib/dates";
import PmTable from "../components/PmTable";
import AmcTable from "../components/AmcTable";
import { AmcModal, ClosePmModal, DelayPmModal } from "../components/modals";
import { PageHeader, Panel, Stat } from "../components/ui";

export default function EngineerPage() {
  const { user } = useAuth();
  const { contracts, quick } = useData();
  const [dlg, setDlg] = useState(null);
  const close = () => setDlg(null);

  const open = openPms(contracts);
  const week = open.filter((x) => x.p.date >= offsetIso(0) && x.p.date <= offsetIso(7));

  return (
    <>
      <PageHeader title={"Hello, " + user.name.split(" ")[0]} text={ROLE_INFO.engineer[1]} />

      <div className="stats">
        <Stat value={open.length} label="Open PMs" />
        <Stat value={open.filter((x) => isOverdue(x.p)).length} label="Overdue PMs" tone="late" />
        <Stat value={week.length} label="Due in the next 7 days" tone="soon" />
      </div>

      <Panel title="My PM visits">
        <PmTable
          rows={open}
          action={({ c, p, i }) => (
            <div className="acts">
              {p.state !== "Acknowledged" && (
                <button className="btn alt" onClick={() => quick(() => api.acknowledgePm(c.id, i), "PM acknowledged.")}>
                  Acknowledge
                </button>
              )}
              <button className="btn alt" onClick={() => setDlg(<DelayPmModal contract={c} index={i} onClose={close} />)}>
                Delay
              </button>
              <button className="btn" onClick={() => setDlg(<ClosePmModal contract={c} index={i} onClose={close} />)}>
                Close
              </button>
            </div>
          )}
        />
      </Panel>

      <Panel title="My AMC follow-ups">
        <AmcTable contracts={amcList(contracts)} onUpdate={(c) => setDlg(<AmcModal contract={c} onClose={close} />)} />
      </Panel>

      {dlg}
    </>
  );
}
