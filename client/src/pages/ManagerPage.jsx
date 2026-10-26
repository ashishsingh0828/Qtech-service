import { useState } from "react";
import { useData } from "../context/DataContext";
import { ROLE_INFO } from "../lib/constants";
import { reminderFor } from "../lib/reminders";
import { amcList, isOverdue, openPms } from "../lib/pm";
import PmTable from "../components/PmTable";
import AmcTable from "../components/AmcTable";
import { AmcModal } from "../components/modals";
import { PageHeader, Panel, Stat } from "../components/ui";

export default function ManagerPage() {
  const { contracts } = useData();
  const [dlg, setDlg] = useState(null);

  const open = openPms(contracts);
  const escalated = open.filter((x) => {
    const r = reminderFor(x.p.date, x.p.ack);
    return r && r.to !== "Engineer";
  });
  const amc = amcList(contracts);

  return (
    <>
      <PageHeader title="Escalations and renewals" text={ROLE_INFO.manager[1]} />

      <div className="stats">
        <Stat value={open.length} label="Open PMs" />
        <Stat value={open.filter((x) => isOverdue(x.p)).length} label="Overdue PMs" tone="late" />
        <Stat value={escalated.length} label="Escalated by reminders" tone="soon" />
        <Stat value={amc.filter((c) => c.amc.state !== "Accepted").length} label="AMC not yet accepted" tone="soon" />
      </div>

      <Panel title="PMs escalated beyond the engineer">
        <PmTable rows={escalated} />
      </Panel>

      <Panel title="AMC follow-up">
        <AmcTable contracts={amc} onUpdate={(c) => setDlg(<AmcModal contract={c} onClose={() => setDlg(null)} />)} />
      </Panel>

      {dlg}
    </>
  );
}
