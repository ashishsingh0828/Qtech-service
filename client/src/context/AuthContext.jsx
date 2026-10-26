import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as api from "../api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api
      .me()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setReady(true));
  }, []);

  // httpApi fires this when any request comes back 401 (session expired or account removed)
  useEffect(() => {
    const onExpired = () => setUser(null);
    window.addEventListener("sd:unauthorized", onExpired);
    return () => window.removeEventListener("sd:unauthorized", onExpired);
  }, []);

  const value = useMemo(
    () => ({
      user,
      ready,
      login: async (email, password) => {
        const u = await api.login(email, password);
        setUser(u);
        return u;
      },
      logout: async () => {
        await api.logout();
        setUser(null);
      },
    }),
    [user, ready]
  );

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
