// The one place that says who may do what. Routes use it, and the tests check the whole table.
const ALL = ["engineer", "coordinator", "manager", "accounts", "admin"];

export const PERMISSIONS = {
  listContracts: ALL,
  listEngineers: ALL,
  pmAction: ["engineer"],
  requestOtp: ["engineer", "manager", "accounts", "admin"],
  updateAmc: ["engineer", "manager", "accounts", "admin"],
  assignEngineer: ["coordinator", "admin"],
  validateContract: ["admin"],
  addContract: ["admin"],
  excel: ["admin"],
  manageUsers: ["admin"],
};

export const can = (role, action) => Boolean(PERMISSIONS[action]?.includes(role));

// Engineers only ever touch contracts assigned to them. Everyone else sees all.
export function canAccessContract(user, contract) {
  if (user.role !== "engineer") return true;
  return contract.engineer != null && String(contract.engineer) === String(user.id);
}
