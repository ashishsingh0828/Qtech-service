import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { ROLE_HOME } from "../lib/constants";

// Must be signed in
export function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <p className="boot">Loading...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

// Must have this exact role, otherwise go to your own home
export function RequireRole({ role }) {
  const { user } = useAuth();
  return user.role === role ? <Outlet /> : <Navigate to={ROLE_HOME[user.role]} replace />;
}

export function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={ROLE_HOME[user.role]} replace />;
}
