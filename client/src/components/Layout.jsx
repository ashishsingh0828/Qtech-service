import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { NAV, ROLE_LABEL } from "../lib/constants";

export default function Layout() {
  const { user, logout } = useAuth();
  const { loading, error, refresh } = useData();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="mark">Q</span>
          <b>Qtech Service Desk</b>
        </div>

        <nav className="roles" aria-label="Main">
          {NAV[user.role].map((n) => (
            <NavLink key={n.to} to={n.to} end className={({ isActive }) => (isActive ? "navlink active" : "navlink")}>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="who">
          <b>{user.name}</b>
          <small>{ROLE_LABEL[user.role]}</small>
          <button className="btn alt out" onClick={signOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main>
        {loading ? (
          <p className="note">Loading data...</p>
        ) : error ? (
          <div className="panel">
            <p className="form-error">{error}</p>
            <button className="btn" onClick={refresh}>
              Try again
            </button>
          </div>
        ) : (
          <Outlet />
        )}
      </main>
    </div>
  );
}
