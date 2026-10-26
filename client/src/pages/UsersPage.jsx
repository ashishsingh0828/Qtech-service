import { useCallback, useEffect, useState } from "react";
import * as api from "../api";
import { useAuth } from "../context/AuthContext";
import { useData } from "../context/DataContext";
import { useToast } from "../context/ToastContext";
import { ROLE_LABEL } from "../lib/constants";
import { EditUserModal, UserModal } from "../components/modals";
import { PageHeader, Panel, Tag } from "../components/ui";

export default function UsersPage() {
  const { user: me } = useAuth();
  const { refresh } = useData();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => api.listUsers().then(setUsers).catch((e) => toast(e.message, "bad")), [toast]);
  useEffect(() => {
    load();
  }, [load]);

  async function remove(u) {
    if (!window.confirm(`Delete ${u.name}? Their contracts become unassigned.`)) return;
    try {
      await api.deleteUser(u.id);
      toast("User deleted.");
      await load();
      await refresh();
    } catch (e) {
      toast(e.message, "bad");
    }
  }

  return (
    <>
      <PageHeader title="Users" text="Create logins and choose which workspace each person gets. Each role only sees its own pages." />

      <Panel
        title={`${users.length} users`}
        actions={
          <button className="btn" onClick={() => setDlg(true)}>
            Add user
          </button>
        }
      >
        <div className="scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.name} {u.id === me.id && <Tag>You</Tag>}
                  </td>
                  <td>{u.email}</td>
                  <td>{ROLE_LABEL[u.role]}</td>
                  <td>
                    <div className="row">
                      <button className="btn alt" onClick={() => setEditing(u)}>
                        Edit
                      </button>
                      {u.id !== me.id && (
                        <button className="btn alt" onClick={() => remove(u)}>
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {editing && (
        <EditUserModal
          user={editing}
          isSelf={editing.id === me.id}
          onClose={() => setEditing(null)}
          onSaved={() => {
            load();
            refresh();
          }}
        />
      )}

      {dlg && (
        <UserModal
          onClose={() => setDlg(false)}
          onSaved={() => {
            load();
            refresh();
          }}
        />
      )}
    </>
  );
}
