export const ROLE_LABEL = {
  engineer: "Service Engineer",
  coordinator: "Service Coordinator",
  manager: "Service Manager",
  accounts: "Accounts",
  admin: "Admin",
};

export const ROLE_HOME = {
  engineer: "/engineer",
  coordinator: "/coordinator",
  manager: "/manager",
  accounts: "/accounts",
  admin: "/admin",
};

export const ROLE_INFO = {
  engineer: ["My PMs and AMC calls", "Acknowledge, delay or close your PM visits. Closing needs a service report and the customer OTP."],
  coordinator: ["Monthly PM calendar", "Every open PM by month. Assign engineers and watch the reminder level."],
  manager: ["Escalations and renewals", "PMs that reminders have escalated, and the AMC follow-up pipeline."],
  accounts: ["AMC and cheques", "Follow AMC outcomes, cheque dates and accepted contracts."],
  admin: ["Data and validation", "Upload or download the Excel sheet, add contracts and validate data."],
};

export const NAV = {
  engineer: [{ to: "/engineer", label: "My work" }],
  coordinator: [{ to: "/coordinator", label: "PM calendar" }],
  manager: [{ to: "/manager", label: "Escalations and renewals" }],
  accounts: [{ to: "/accounts", label: "AMC and cheques" }],
  admin: [
    { to: "/admin", label: "Contracts and data" },
    { to: "/admin/users", label: "Users" },
  ],
};

export const CONTRACT_TYPES = [
  "Warranty",
  "Extended Warranty",
  "Extended CMC",
  "Paid AMC",
  "CMC",
  "Annual Calibration",
  "Paid Single Visit",
];

export const DELAY_REASONS = ["Customer Not Available", "Out Station Calls Club", "Other reason"];
export const AMC_STATES = ["Pending", "Delayed", "Refusal", "Accepted"];
export const AMC_REASONS = [
  "",
  "Customer Not Available",
  "Out Station Calls Club",
  "Other reason",
  "Customer Not Agreed",
  "Service not up to mark",
  "Not happy with service",
];
