import { useEffect, useRef, useState } from "react";

function Field({ f }) {
  if (f.options) {
    return (
      <select name={f.name} defaultValue={f.value ?? ""} required={f.required}>
        {f.options.map((o) => {
          const value = typeof o === "string" ? o : o.value;
          const label = typeof o === "string" ? o || "Not set" : o.label;
          return (
            <option key={value} value={value}>
              {label}
            </option>
          );
        })}
      </select>
    );
  }
  if (f.type === "file") {
    return <input name={f.name} type="file" accept={f.accept} required={f.required} />;
  }
  return (
    <input
      name={f.name}
      type={f.type || "text"}
      defaultValue={f.value ?? ""}
      required={f.required}
      autoComplete={f.type === "password" ? "new-password" : "off"}
    />
  );
}

/*
  fields: [{ name, label, type, options, value, required, hint, accept }]
  onSubmit(values): async. Throw an Error to show its message inside the form.
  otp: { send: async () => ({ demoCode? }) } adds a "Send OTP" button.
*/
export default function FormModal({ title, note, fields, submitLabel = "Save", onSubmit, onClose, otp }) {
  const ref = useRef(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpMsg, setOtpMsg] = useState("");

  useEffect(() => {
    const d = ref.current;
    d.showModal();
    return () => {
      if (d.open) d.close();
    };
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await onSubmit(Object.fromEntries(new FormData(e.currentTarget)));
      onClose();
    } catch (err) {
      setError(err.message || "Something went wrong.");
      setBusy(false);
    }
  }

  async function sendOtp() {
    setError("");
    try {
      const r = await otp.send();
      setOtpMsg(r.demoCode ? `OTP sent. Demo code: ${r.demoCode}` : "OTP sent to the customer.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <form className="dlg-in" onSubmit={submit}>
        <h2>{title}</h2>
        {note && <p className="note">{note}</p>}

        {fields.map((f) => (
          <label key={f.name}>
            {f.label}
            <Field f={f} />
            {f.hint && <small>{f.hint}</small>}
          </label>
        ))}

        {otp && (
          <div className="otp-row">
            <button type="button" className="btn alt" onClick={sendOtp}>
              Send OTP to customer
            </button>
            {otpMsg && <span className="note">{otpMsg}</span>}
          </div>
        )}

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <div className="row">
          <button className="btn" disabled={busy}>
            {busy ? "Saving..." : submitLabel}
          </button>
          <button type="button" className="btn alt" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
