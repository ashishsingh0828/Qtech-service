import test from "node:test";
import assert from "node:assert/strict";
import { PERMISSIONS, can, canAccessContract } from "../../src/lib/policy.js";

const ROLES = ["engineer", "coordinator", "manager", "accounts", "admin"];

// The expected table is written out by hand on purpose: it is the spec from the step 1 README.
const EXPECTED = {
  listContracts: ROLES,
  listEngineers: ROLES,
  pmAction: ["engineer"],
  requestOtp: ["engineer", "manager", "accounts", "admin"],
  updateAmc: ["engineer", "manager", "accounts", "admin"],
  assignEngineer: ["coordinator", "admin"],
  validateContract: ["admin"],
  addContract: ["admin"],
  excel: ["admin"],
  manageUsers: ["admin"],
};

test("permission table matches the spec for every role and action", () => {
  assert.deepEqual(Object.keys(PERMISSIONS).sort(), Object.keys(EXPECTED).sort());
  for (const [action, allowed] of Object.entries(EXPECTED)) {
    for (const role of ROLES) {
      assert.equal(can(role, action), allowed.includes(role), `${role} / ${action}`);
    }
  }
});

test("unknown actions and roles are denied", () => {
  assert.equal(can("admin", "launchRockets"), false);
  assert.equal(can("hacker", "listContracts"), false);
  assert.equal(can(undefined, "listContracts"), false);
});

test("engineers reach only their own contracts; other roles reach all", () => {
  const mine = { engineer: "e1" };
  assert.equal(canAccessContract({ role: "engineer", id: "e1" }, mine), true);
  assert.equal(canAccessContract({ role: "engineer", id: "e2" }, mine), false);
  assert.equal(canAccessContract({ role: "engineer", id: "e1" }, { engineer: null }), false);
  for (const role of ["coordinator", "manager", "accounts", "admin"]) {
    assert.equal(canAccessContract({ role, id: "x" }, mine), true);
  }
});
