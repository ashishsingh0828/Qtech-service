import { useState } from "react";
import { useData } from "../context/DataContext";
import { ROLE_INFO } from "../lib/constants";
import { amcList } from "../lib/pm";
import AmcTable from "../components/AmcTable";
import { AmcModal } from "../components/modals";
import { PageHeader, Panel, Stat } from "../components/ui";

export default function AccountsPage() {
  const { contracts } = useData();
  const [dlg, setDlg] = useState(null);
  const count = (s) => contracts.filter((c) => c.amc.state === s).length;

  return (
    <>
      <PageHeader title="AMC and cheques" text={ROLE_INFO.accounts[1]} />

      <div className="stats">
        <Stat value={count("Accepted")} label="AMC accepted" />
        <Stat value={count("Delayed")} label="Awaiting cheque" tone="soon" />
        <Stat value={count("Refusal")} label="Refused" tone="late" />
        <Stat value={count("Pending")} label="Pending" />
      </div>

      <Panel title="AMC and cheques">
        <AmcTable contracts={amcList(contracts)} onUpdate={(c) => setDlg(<AmcModal contract={c} onClose={() => setDlg(null)} />)} />
      </Panel>

      {dlg}
    </>
  );
}
