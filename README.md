# Qtech Service Desk

Qtech's service-contract desk for lab instruments (Warranty, Extended Warranty, AMC): scheduled PM visits, engineer assignment, OTP-verified closure, and AMC renewal tracking.

```
qtech-service-desk/
  client/   Vite + React
  server/   Node 22 + Express + MongoDB
```

The UI talks to the server only through `client/src/api/httpApi.js` (REST under `/api`, session in an httpOnly cookie). In production the server also serves the built UI (`STATIC_DIR=../client/dist`).

## Run it locally

You need Node 22+ and a MongoDB (local install, or a free Atlas cluster).

```bash
# 1. Backend
cd server
npm install
cp .env.example .env          # then set JWT_SECRET (instructions inside the file) and MONGO_URI
npm run seed:demo             # demo users + contracts, development only
npm run dev                   # http://localhost:5000

# 2. Frontend (second terminal)
cd client
npm install
npm run dev                   # http://localhost:5173
```

Demo accounts (after `seed:demo`), password `demo1234`: admin@, coordinator@, manager@, accounts@, ravi@ (also anil@, meena@) `@servicedesk.test`.
The login page shows quick-fill buttons for them in development builds only.

For a real deployment: `npm run seed:admin` (reads `SEED_ADMIN_*` from `.env`), then create everyone else on the Users page.

## Tests

```bash
cd server
npm test           # unit tests (no database): permissions, dates, PM schedule, Excel mapping, OTP crypto, Resend mail, upload checks, config guards
npm run test:int   # HTTP tests against an in-memory MongoDB, including both disk and GridFS storage
                   # if the MongoDB binary download is blocked: MONGOMS_SYSTEM_BINARY=/path/to/mongod MONGOMS_SYSTEM_BINARY_VERSION_CHECK=false npm run test:int
```

After deploy, send one test email with the current env:

```bash
cd server
npm run test:mail -- someone@example.com
```

## What the backend does

| Area | How |
|---|---|
| Passwords | bcrypt hashes (cost 12). Min 8, max 72 characters. 5 wrong tries lock the account for 15 minutes. Login is also rate limited per IP. |
| Sessions | JWT in an httpOnly, SameSite=Lax cookie (8 hours). The user is re-read from the database on every request, so deleting a user ends their session at once. Cross-site writes are refused by an Origin check. Same-origin posts (the built UI on this server) are allowed. |
| Roles | One table in `server/src/lib/policy.js`, enforced on every route. Engineers get "not found" for contracts that are not theirs, including reports and AMC documents. |
| OTP | The code is sent to the **customer** (mobile/mail on the contract), never to the engineer. Stored as an HMAC, single use, expires in 10 min, 5 tries, 30 s between sends, 5 sends per hour per item. |
| Email | `NOTIFY_PROVIDER=resend` posts to the Resend HTTPS API (Render free blocks SMTP ports 25/465/587). `console` and `smtp` still work for local development. Production refuses `console` and `OTP_DEV_ECHO=true`. |
| Uploads | PDF, JPG, PNG, DOC, DOCX up to 10 MB. The file's first bytes must match its extension. `STORAGE_DRIVER=gridfs` (production default) stores files in MongoDB so they survive Render restarts. `disk` is the local-folder default in development and tests. |
| PM changes | The "not already closed" check is part of the database write, so two requests cannot close the same PM twice. |
| Excel | `exceljs` on the server. Import and export use the live "customer handling for service" layout (sheet `data handling`, grouped header row, typo headers such as `Euipment Name` and `Compaint`). |

## Excel import rules

* A row is a **duplicate** when customer + equipment + serial no + start date all match an existing contract (or an earlier row in the same file). A renewal has a new start date, so it imports.
* `.xls` (old format) is not supported. Save it as `.xlsx` first.
* Dates are read day-first (04/03/2026 = 4 March).
* Max 5000 rows per file.
* Extra columns (breakdown calls, complaints, AMC follow-up) are kept on export and ignored on import if we do not store them yet.

## API

All routes are under `/api` and need a session cookie, except `/auth/login`, `/auth/logout`, `/auth/me`, `/health`.

| Route | Roles |
|---|---|
| POST /auth/login, POST /auth/logout, GET /auth/me | anyone |
| GET /contracts | all (engineers: their own only) |
| POST /contracts, PUT /contracts/:id/validation | admin |
| PUT /contracts/:id/engineer | coordinator, admin |
| POST /contracts/:id/pms/:index/ack, /delay, /close | engineer (own contracts) |
| PUT /contracts/:id/amc | engineer (own), manager, accounts, admin |
| GET /contracts/:id/pms/:index/report, GET /contracts/:id/amc/document | anyone who can see that contract |
| POST /otp | engineer (own), manager, accounts, admin |
| GET /users/engineers | all |
| GET/POST /users, PUT /users/:id (name, role, new password), DELETE /users/:id | admin |
| POST /excel/import, GET /excel/export | admin |

## Users page

Admins can add, edit and delete users. **Edit** changes name and role, and can set a new password (blank keeps the old one).
A new password signs that person out of every device. You cannot change your own role. Moving someone away from Engineer unassigns their contracts.
Closed PMs show a "Download service report" link and AMC rows show their attached document. Both go through the authorised routes.

## Run as one server (no Vite, closest to production)

```bash
cd client && npm install && npm run build
cd ../server              # in .env set STATIC_DIR=../client/dist
npm start                 # UI and API both on http://localhost:5000
```

## Deploy on Render (free web service)

Render free services sleep after 15 minutes idle and have no persistent disk. Design around that:

1. Create a MongoDB Atlas M0 cluster. Under Network Access allow `0.0.0.0/0` and use a strong database password (Render has no fixed outbound IP).
2. Create a Resend API key. Before a Qtech domain is verified, mail can only be sent from `onboarding@resend.dev`. To email customers, add the domain in Resend and set SPF + DKIM.
3. Push this repo to GitHub and create a Render **Web Service** from it (or apply `render.yaml`).
4. Set these env vars in the Render dashboard (never commit them):

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | Atlas connection string |
| `JWT_SECRET` | 32+ random characters (Render can generate this) |
| `NOTIFY_PROVIDER` | `resend` |
| `RESEND_API_KEY` | from the Resend dashboard |
| `MAIL_FROM` | `Qtech Service Desk <noreply@YOUR-VERIFIED-DOMAIN>` |
| `STORAGE_DRIVER` | `gridfs` |
| `STATIC_DIR` | `../client/dist` |
| `TRUST_PROXY` | `1` |
| `CLIENT_ORIGIN` | `https://YOUR-SERVICE.onrender.com` |
| `TZ_NAME` | `Asia/Kolkata` |

5. After the first deploy, open the Render shell and create the first admin (do not use `seed:demo` in production):

```bash
cd server
SEED_ADMIN_NAME="Admin User" SEED_ADMIN_EMAIL="you@yourcompany.com" SEED_ADMIN_PASSWORD="a-long-password" npm run seed:admin
```

6. Confirm `GET /api/health` returns `{"ok":true}`, then sign in and import the `data handling` Excel sheet.

## Known gaps

* **SMS.** OTP goes by email. SMS needs a gateway (MSG91, Twilio, ...); the spot is marked `TODO(SMS)` in `server/src/services/notifier.js`.
* Constants (roles, reasons, contract types) are duplicated in `client/src/lib/constants.js` and `server/src/lib/constants.js`.
