import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isMock } from "../api";
import { ROLE_HOME, ROLE_LABEL } from "../lib/constants";

const DEMO = [
  ["admin@servicedesk.test", "admin"],
  ["coordinator@servicedesk.test", "coordinator"],
  ["manager@servicedesk.test", "manager"],
  ["accounts@servicedesk.test", "accounts"],
  ["ravi@servicedesk.test", "engineer"],
];

export default function Login() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={ROLE_HOME[user.role]} replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const u = await login(email, password);
      const back = location.state?.from?.pathname;
      // only return to the earlier page if this role may open it
      navigate(back && back.startsWith(ROLE_HOME[u.role]) ? back : ROLE_HOME[u.role], { replace: true });
    } catch (err) {
      setError(err.message || "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <section className="login-art">
        <div className="brand">
          <span className="mark">Q</span>
          <b>Qtech Service Desk</b>
        </div>
        <h1>Every PM visit and AMC renewal, on time.</h1>
        <p>Preventive maintenance, contract renewals and cheques in one place, with a separate workspace for each role.</p>
        <ul>
          <li>Engineers close visits with a report and customer OTP</li>
          <li>Reminders escalate to managers and the HOD automatically</li>
          <li>Excel import and export in your existing sheet layout</li>
        </ul>
      </section>

      <section className="login-card">
        <form onSubmit={submit}>
          <h2>Sign in</h2>
          <p className="note">Use the email and password your admin created for you.</p>

          <label>
            Email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required autoFocus />
          </label>

          <label>
            Password
            <span className="pw">
              <input type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
              <button type="button" className="btn alt" onClick={() => setShow((s) => !s)} aria-pressed={show}>
                {show ? "Hide" : "Show"}
              </button>
            </span>
          </label>

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button className="btn wide" disabled={busy}>
            {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {(isMock || import.meta.env.DEV) && (
          <div className="demo">
            <b>Demo accounts</b>
            <p className="note">Development only. Works after npm run seed:demo (password demo1234). Click one to fill the form.</p>
            <div className="demo-list">
              {DEMO.map(([mail, role]) => (
                <button
                  key={mail}
                  type="button"
                  className="btn alt"
                  onClick={() => {
                    setEmail(mail);
                    setPassword("demo1234");
                  }}
                >
                  {ROLE_LABEL[role]}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
