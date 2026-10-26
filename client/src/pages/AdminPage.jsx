import { useRef, useState } from "react";
import * as api from "../api";
import { useData } from "../context/DataContext";
import { useToast } from "../context/ToastContext";
import { ROLE_INFO } from "../lib/constants";
import { downloadBlob } from "../lib/download";
import { flattenPms } from "../lib/pm";
import { ContractModal, ValidateModal } from "../components/modals";
import { PageHeader, Panel, Stat, Tag } from "../components/ui";

export default function AdminPage() {
  const { contracts, act, engName } = useData();
  const toast = useToast();
  const fileRef = useRef(null);
  const [dlg, setDlg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const close = () => setDlg(null);

  async function onFile(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const r = await act(() => api.importExcel(file));
      setResult(r);
      toast(`Imported ${r.imported} contracts.`);
    } catch (err) {
      toast(err.message, "bad");
    } finally {
      setBusy(false);
    }
  }

  async function onExport() {
    try {
      const { blob, filename } = await api.exportExcel();
      downloadBlob(blob, filename);
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  async function onReset() {
    if (!window.confirm("Replace all demo data with the sample data?")) return;
    try {
      await act(() => api.resetDemo());
      setResult(null);
      toast("Demo data reset.");
    } catch (err) {
      toast(err.message, "bad");
    }
  }

  return (
    <>
      <PageHeader title="Data and validation" text={ROLE_INFO.admin[1]} />

      <div className="stats">
        <Stat value={contracts.length} label="Contracts" />
        <Stat value={contracts.filter((c) => c.valid !== "Yes").length} label="Not validated" tone="soon" />
        <Stat value={flattenPms(contracts).length} label="PM visits scheduled" />
      </div>

      <Panel>
        <div className="row">
          <button className="btn" disabled={busy} onClick={() => fileRef.current.click()}>
            {busy ? "Importing..." : "Upload Excel"}
          </button>
          <button className="btn alt" onClick={onExport}>
            Download Excel
          </button>
          <button className="btn alt" onClick={() => setDlg(<ContractModal onClose={close} />)}>
            Add contract
          </button>
          {api.isMock && (
            <button className="btn alt" onClick={onReset}>
              Reset demo data
            </button>
          )}
          <input ref={fileRef} type="file" accept=".xlsx,.csv" hidden onChange={onFile} />
        </div>

        <p className="note">
          Upload reads the same columns as your data handling sheet, with PMS 1 to 15 as scheduled dates and PM Date as the date done.
          Contracts already present (same customer, equipment, serial no and start date) are skipped. Download writes the same layout plus an Engineer column.
        </p>

        {result && (
          <p className="banner">
            Last upload: {result.imported} imported, {result.skipped} skipped as duplicates, {result.unreadable} rows could not be read.
          </p>
        )}
      </Panel>

      <Panel title="Contracts and data validation">
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Sr</th>
                <th>Customer</th>
                <th>Machine</th>
                <th>Contract</th>
                <th>Engineer</th>
                <th>PMs</th>
                <th>Validated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {contracts.map((c, i) => (
                <tr key={c.id}>
                  <td>{i + 1}</td>
                  <td>
                    {c.cust}
                    <div className="note">{c.city}</div>
                  </td>
                  <td>
                    {c.equip}
                    <div className="note">{c.serial}</div>
                  </td>
                  <td>
                    {c.type}
                    <div className="note">
                      {c.start} to {c.end}
                    </div>
                  </td>
                  <td>{engName(c.engineerId)}</td>
                  <td>{c.pms.length}</td>
                  <td>
                    <Tag tone={c.valid === "Yes" ? "ok" : "warn"}>{c.valid}</Tag>
                    {c.vby && <div className="note">by {c.vby}</div>}
                    {c.valid !== "Yes" && c.vdue && <div className="note">due {c.vdue}</div>}
                  </td>
                  <td>
                    <button className="btn alt" onClick={() => setDlg(<ValidateModal contract={c} onClose={close} />)}>
                      Validate
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {dlg}
    </>
  );
}
