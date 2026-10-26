import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as api from "../api";
import { useToast } from "./ToastContext";

const DataCtx = createContext(null);

export function DataProvider({ children }) {
  const toast = useToast();
  const [state, setState] = useState({ contracts: [], engineers: [], loading: true, error: "" });

  const refresh = useCallback(async () => {
    try {
      const [contracts, engineers] = await Promise.all([api.listContracts(), api.listEngineers()]);
      setState({ contracts, engineers, loading: false, error: "" });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Runs a server action, then reloads data. Errors are thrown (used by forms).
  const act = useCallback(
    async (fn) => {
      const result = await fn();
      await refresh();
      return result;
    },
    [refresh]
  );

  // Same, but shows a toast instead of throwing (used by plain buttons).
  const quick = useCallback(
    async (fn, okMessage) => {
      try {
        await act(fn);
        if (okMessage) toast(okMessage);
      } catch (e) {
        toast(e.message, "bad");
      }
    },
    [act, toast]
  );

  const value = useMemo(() => {
    const names = new Map(state.engineers.map((e) => [e.id, e.name]));
    return { ...state, refresh, act, quick, engName: (id) => names.get(id) || "Unassigned" };
  }, [state, refresh, act, quick]);

  return <DataCtx.Provider value={value}>{children}</DataCtx.Provider>;
}

export const useData = () => useContext(DataCtx);
