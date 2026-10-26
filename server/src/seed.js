// npm run seed:admin   creates the first admin from SEED_ADMIN_* in .env (safe in production)
// npm run seed:demo    loads the step 1 demo users and contracts (development only)
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { config } from "./env.js";
import { User } from "./models/User.js";
import { Contract } from "./models/Contract.js";
import { Otp } from "./models/Otp.js";
import { EMAIL_RE } from "./lib/validate.js";
import { addDays, todayIso } from "./lib/dates.js";
import { buildSchedule, mkPm } from "./lib/schedule.js";

const mode = process.argv[2];
const hash = (pw) => bcrypt.hash(pw, config.bcryptRounds);
const offset = (n) => addDays(todayIso(config.tz), n);

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  const name = process.env.SEED_ADMIN_NAME || "Admin";
  if (!EMAIL_RE.test(email)) throw new Error("Set SEED_ADMIN_EMAIL in .env.");
  if (password.length < 12) throw new Error("Set SEED_ADMIN_PASSWORD in .env (at least 12 characters).");
  if (await User.exists({ email })) return console.log(`${email} already exists. Nothing changed.`);
  await User.create({ name, email, role: "admin", passwordHash: await hash(password) });
  console.log(`Admin created: ${email}`);
}

async function seedDemo() {
  if (config.isProd) throw new Error("Demo data is for development only. It uses the password demo1234.");
  if (!process.argv.includes("--reset") && ((await User.estimatedDocumentCount()) || (await Contract.estimatedDocumentCount()))) {
    throw new Error("The database already has data. Run `npm run seed:demo -- --reset` to wipe it and load the demo.");
  }
  await Promise.all([User.deleteMany({}), Contract.deleteMany({}), Otp.deleteMany({})]);

  const passwordHash = await hash("demo1234");
  const [, , , , ravi, anil, meena] = await User.insertMany(
    [
      ["Admin User", "admin@servicedesk.test", "admin"],
      ["Priya Nair", "coordinator@servicedesk.test", "coordinator"],
      ["Suresh Menon", "manager@servicedesk.test", "manager"],
      ["Kavita Joshi", "accounts@servicedesk.test", "accounts"],
      ["Ravi Kumar", "ravi@servicedesk.test", "engineer"],
      ["Anil Sharma", "anil@servicedesk.test", "engineer"],
      ["Meena Iyer", "meena@servicedesk.test", "engineer"],
    ].map(([name, email, role]) => ({ name, email, role, passwordHash }))
  );

  // PMs more than 14 days old are already closed, as in the step 1 demo
  const make = (o) => {
    const pms = buildSchedule(o.start, o.end).map((d) => (d < offset(-14) ? mkPm(d, d) : mkPm(d)));
    return { ...o, pms };
  };
  await Contract.insertMany([
    make({ cust: "Apex Labs", city: "Gurugram", contact: "Dr. Mehta", mobile: "9800000001", mail: "lab@apex.example", loc: "Cell Culture, 1st Floor", type: "Warranty", equip: "CO2 Incubator", serial: "CI-2210", start: offset(-160), end: offset(570), engineer: ravi._id, valid: "Yes", vby: "Admin" }),
    make({ cust: "City Hospital", city: "New Delhi", contact: "Ms. Rao", mobile: "9800000002", mail: "bio@cityhosp.example", loc: "Biochemistry", type: "Paid AMC", equip: "Centrifuge CF-50", serial: "CF50-1187", start: offset(-330), end: offset(35), engineer: anil._id, valid: "Yes", vby: "Admin" }),
    make({ cust: "BioGen Pharma", city: "Faridabad", contact: "Mr. Singh", mobile: "9800000003", mail: "qa@biogen.example", loc: "QC Lab", type: "Extended CMC", equip: "Spectrometer SP-9", serial: "SP9-0098", start: offset(-100), end: offset(265), engineer: meena._id, vdue: offset(5) }),
    make({ cust: "Sunrise Clinic", city: "Noida", contact: "Dr. Kapoor", mobile: "9800000004", mail: "admin@sunrise.example", loc: "Pathology", type: "CMC", equip: "Incubator IN-80", serial: "IN80-2210", start: offset(-740), end: offset(-9), engineer: meena._id, valid: "Yes", vby: "Admin" }),
  ]);
  console.log("Demo data loaded. Sign in with e.g. admin@servicedesk.test / demo1234");
}

try {
  if (!["admin", "demo"].includes(mode)) throw new Error("Usage: node src/seed.js admin|demo");
  await mongoose.connect(config.mongoUri);
  await (mode === "admin" ? seedAdmin() : seedDemo());
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
