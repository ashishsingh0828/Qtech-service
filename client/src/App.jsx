import { Navigate, Route, Routes } from "react-router-dom";
import { DataProvider } from "./context/DataContext";
import { HomeRedirect, RequireAuth, RequireRole } from "./components/guards";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import EngineerPage from "./pages/EngineerPage";
import CoordinatorPage from "./pages/CoordinatorPage";
import ManagerPage from "./pages/ManagerPage";
import AccountsPage from "./pages/AccountsPage";
import AdminPage from "./pages/AdminPage";
import UsersPage from "./pages/UsersPage";

function Protected() {
  return (
    <RequireAuth>
      <DataProvider>
        <Layout />
      </DataProvider>
    </RequireAuth>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<Protected />}>
        <Route path="/" element={<HomeRedirect />} />

        <Route element={<RequireRole role="engineer" />}>
          <Route path="/engineer" element={<EngineerPage />} />
        </Route>
        <Route element={<RequireRole role="coordinator" />}>
          <Route path="/coordinator" element={<CoordinatorPage />} />
        </Route>
        <Route element={<RequireRole role="manager" />}>
          <Route path="/manager" element={<ManagerPage />} />
        </Route>
        <Route element={<RequireRole role="accounts" />}>
          <Route path="/accounts" element={<AccountsPage />} />
        </Route>
        <Route element={<RequireRole role="admin" />}>
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/users" element={<UsersPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
