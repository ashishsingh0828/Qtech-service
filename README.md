# Qtech Service Desk

```
qtech-service-desk/
  client/   Vite + React (unchanged screens, now talks to the real API)
  server/   Node + Express + MongoDB
```

## Run it

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
npm test           # 27 unit tests, no database needed: permissions, dates, PM schedule, Excel mapping, OTP crypto, upload checks, config guards
npm run test:int   # 13 HTTP tests against an in-memory MongoDB (downloads a MongoDB binary on first run;
                   # if your network blocks that, point MONGOMS_SYSTEM_BINARY at an installed mongod)
```

## What the backend does

| Area | How |
|---|---|
| Passwords | bcrypt hashes (cost 12). Min 8, max 72 characters. 5 wrong tries lock the account for 15 minutes. Login is also rate limited per IP. |
| Sessions | JWT in an httpOnly, SameSite=Lax cookie (8 hours). The user is re-read from the database on every request, so deleting a user ends their session at once. Cross-site writes are refused by an Origin check. |
| Roles | One table in `server/src/lib/policy.js`, enforced on every route. Engineers get "not found" for contracts that are not theirs, including reports and AMC documents. |
| OTP | The code is sent to the **customer** (mobile/mail on the contract), never to the engineer. Stored as an HMAC, single use, expires in 10 min, 5 tries, 30 s between sends, 5 sends per hour per item. |
| Uploads | PDF, JPG, PNG, DOC, DOCX up to 10 MB. The file's first bytes must match its extension. Stored outside the web root under random names; downloads go through an authorised route. |
| PM changes | The "not already closed" check is part of the database write, so two requests cannot close the same PM twice. |
| Excel | `exceljs` on the server. Export writes real Excel dates. Import reads `.xlsx` and `.csv`, finds the header row itself, matches engineers by name, and skips duplicates. |

## Excel import rules (please confirm)

* A row is a **duplicate** when customer + equipment + serial no + start date all match an existing contract (or an earlier row in the same file). The old demo used customer + serial only, which would wrongly skip two machines with a blank serial, or a renewal of the same machine. A renewal has a new start date, so it imports.
* `.xls` (old format) is not supported. Save it as `.xlsx` first.
* Dates are read day-first (04/03/2026 = 4 March).
* Max 5000 rows per file.

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

## Known gaps (not built yet)

* **SMS.** OTP goes by email through SMTP, or to the server log in development. SMS needs a gateway (MSG91, Twilio, ...); the spot is marked `TODO(SMS)` in `server/src/services/notifier.js`.
* Constants (roles, reasons, contract types) are duplicated in `client/src/lib/constants.js` and `server/src/lib/constants.js`.
