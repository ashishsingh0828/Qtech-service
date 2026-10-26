/*
  The real REST client. Same function names, inputs and outputs as the step 1 mock,
  so no page needed to change. Requests go to /api (Vite proxies it to the server in dev).
  The sign-in token lives in an httpOnly cookie, so no code here ever sees it.
*/
export const isMock = false;

const BASE = "/api";

async function request(method, path, { json, form } = {}) {
  const opts = { method, credentials: "include", headers: {} };
  if (json !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(json);
  }
  if (form) opts.body = form; // the browser adds the multipart boundary itself

  let res;
  try {
    res = await fetch(BASE + path, opts);
  } catch {
    throw new Error("Cannot reach the server. Check your connection and try again.");
  }

  if (!res.ok) {
    let message = res.status === 401 ? "Please sign in." : "Something went wrong. Try again.";
    try {
      message = (await res.json()).message || message;
    } catch {
      /* not JSON, for example a proxy error page */
    }
    // A 401 anywhere except the login form means the session ended: send the person to sign in.
    if (res.status === 401 && !path.startsWith("/auth/")) window.dispatchEvent(new Event("sd:unauthorized"));
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }
  return res;
}

const data = async (...args) => (await request(...args)).json();

// Browser forms give "" or an empty File when nothing was chosen: send only real files.
function toForm(fields, files = {}) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) f.append(k, v);
  for (const [k, file] of Object.entries(files)) if (file && file.name) f.append(k, file, file.name);
  return f;
}

const enc = encodeURIComponent;

/* ---------- auth ---------- */
export async function login(email, password) {
  return (await data("POST", "/auth/login", { json: { email, password } })).user;
}
export async function logout() {
  await request("POST", "/auth/logout");
}
export async function me() {
  return (await data("GET", "/auth/me")).user;
}

/* ---------- reading data ---------- */
export const listContracts = () => data("GET", "/contracts");
export const listEngineers = () => data("GET", "/users/engineers");

/* ---------- OTP ---------- */
export const requestOtp = ({ contractId, pmIndex }) => data("POST", "/otp", { json: { contractId, pmIndex } });

/* ---------- PM actions (engineer) ---------- */
export async function acknowledgePm(contractId, index) {
  await request("POST", `/contracts/${enc(contractId)}/pms/${index}/ack`);
}
export async function delayPm(contractId, index, v) {
  await request("POST", `/contracts/${enc(contractId)}/pms/${index}/delay`, {
    json: { reason: v.reason, remark: v.remark, plan: v.plan, otp: v.otp },
  });
}
export async function closePm(contractId, index, v) {
  await request("POST", `/contracts/${enc(contractId)}/pms/${index}/close`, {
    form: toForm({ otp: v.otp }, { report: v.report }),
  });
}

/* ---------- AMC follow-up ---------- */
export async function updateAmc(contractId, v) {
  await request("PUT", `/contracts/${enc(contractId)}/amc`, {
    form: toForm({ state: v.state, reason: v.reason, remark: v.remark, date: v.date, otp: v.otp }, { doc: v.doc }),
  });
}

/* ---------- coordinator / admin ---------- */
export async function assignEngineer(contractId, engineerId) {
  await request("PUT", `/contracts/${enc(contractId)}/engineer`, { json: { engineerId: engineerId || "" } });
}
export async function validateContract(contractId, v) {
  await request("PUT", `/contracts/${enc(contractId)}/validation`, { json: { valid: v.valid, vby: v.vby, vdue: v.vdue } });
}
export async function addContract(v) {
  await request("POST", "/contracts", { json: v });
}
export async function resetDemo() {
  throw new Error("Demo reset is only available with the mock backend.");
}

/* ---------- users (admin) ---------- */
export const listUsers = () => data("GET", "/users");
export async function createUser(v) {
  await request("POST", "/users", { json: { name: v.name, email: v.email, role: v.role, password: v.password } });
}
export async function updateUser(id, v) {
  // blank password means "keep the current one"
  const body = { name: v.name, role: v.role };
  if (v.password) body.password = v.password;
  await request("PUT", `/users/${enc(id)}`, { json: body });
}
export async function deleteUser(id) {
  await request("DELETE", `/users/${enc(id)}`);
}

/* ---------- Excel (admin) ---------- */
export async function importExcel(file) {
  if (!file || !file.name) throw new Error("Choose an Excel file first.");
  return data("POST", "/excel/import", { form: toForm({}, { file }) });
}
export async function exportExcel() {
  const res = await request("GET", "/excel/export");
  const named = /filename="?([^";]+)"?/i.exec(res.headers.get("Content-Disposition") || "");
  return { blob: await res.blob(), filename: named ? named[1] : "Engineer_Service_Data.xlsx" };
}
