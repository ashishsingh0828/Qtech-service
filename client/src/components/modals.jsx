import * as api from "../api";
import FormModal from "./FormModal";
import { useData } from "../context/DataContext";
import { useToast } from "../context/ToastContext";
import { addDays, offsetIso } from "../lib/dates";
import { AMC_REASONS, AMC_STATES, CONTRACT_TYPES, DELAY_REASONS, ROLE_LABEL } from "../lib/constants";

export function DelayPmModal({ contract, index, onClose }) {
  const { act } = useData();
  const toast = useToast();
  const p = contract.pms[index];
  return (
    <FormModal
      title="Delay this PM"
      note="If the customer was not available, they must confirm with an OTP."
      onClose={onClose}
      otp={{ send: () => api.requestOtp({ contractId: contract.id, pmIndex: index }) }}
      fields={[
        { name: "reason", label: "Reason", options: DELAY_REASONS },
        { name: "remark", label: "Remarks" },
        { name: "plan", label: "Date planned to close this visit", type: "date", value: addDays(p.date, 7), required: true },
        { name: "otp", label: "Customer OTP (needed if customer not available)" },
      ]}
      onSubmit={async (v) => {
        await act(() => api.delayPm(contract.id, index, v));
        toast("PM marked as delayed.");
      }}
    />
  );
}

export function ClosePmModal({ contract, index, onClose }) {
  const { act } = useData();
  const toast = useToast();
  return (
    <FormModal
      title="Close this PM"
      note={`${contract.equip}, ${contract.cust}`}
      submitLabel="Close PM"
      onClose={onClose}
      otp={{ send: () => api.requestOtp({ contractId: contract.id, pmIndex: index }) }}
      fields={[
        { name: "report", label: "Service report", type: "file", accept: ".pdf,.jpg,.jpeg,.png,.doc,.docx", required: true },
        { name: "otp", label: "Happy OTP code from customer", required: true },
      ]}
      onSubmit={async (v) => {
        await act(() => api.closePm(contract.id, index, v));
        toast("PM closed.");
      }}
    />
  );
}

export function AmcModal({ contract, onClose }) {
  const { act } = useData();
  const toast = useToast();
  const a = contract.amc;
  return (
    <FormModal
      title={"AMC follow-up: " + contract.cust}
      note="OTP is needed for Accepted, Customer Not Available and Customer Not Agreed."
      onClose={onClose}
      otp={{ send: () => api.requestOtp({ contractId: contract.id }) }}
      fields={[
        { name: "state", label: "Outcome", options: AMC_STATES, value: a.state },
        { name: "reason", label: "Reason (for delayed or refusal)", options: AMC_REASONS, value: a.reason },
        { name: "remark", label: "Remarks or feedback", value: a.remark },
        { name: "date", label: "Date of receiving the AMC cheque", type: "date", value: a.date },
        { name: "doc", label: "AMC document and cheque", type: "file", hint: a.doc ? "Already attached: " + a.doc : "Required when accepted" },
        { name: "otp", label: "Customer OTP" },
      ]}
      onSubmit={async (v) => {
        await act(() => api.updateAmc(contract.id, v));
        toast("AMC follow-up saved.");
      }}
    />
  );
}

export function ValidateModal({ contract, onClose }) {
  const { act } = useData();
  const toast = useToast();
  return (
    <FormModal
      title={"Validate data: " + contract.cust}
      onClose={onClose}
      fields={[
        { name: "valid", label: "Validated", options: ["Yes", "No"], value: contract.valid },
        { name: "vby", label: "Validated by", value: contract.vby || "Admin" },
        { name: "vdue", label: "By when data will be validated", type: "date", value: contract.vdue },
      ]}
      onSubmit={async (v) => {
        await act(() => api.validateContract(contract.id, v));
        toast("Validation saved.");
      }}
    />
  );
}

export function ContractModal({ onClose }) {
  const { act, engineers } = useData();
  const toast = useToast();
  return (
    <FormModal
      title="Add contract"
      onClose={onClose}
      fields={[
        { name: "cust", label: "Customer name", required: true },
        { name: "city", label: "City" },
        { name: "contact", label: "Contact person" },
        { name: "mobile", label: "Mobile no" },
        { name: "mail", label: "Mail", type: "email" },
        { name: "loc", label: "Location" },
        { name: "type", label: "Contract type", options: CONTRACT_TYPES },
        { name: "equip", label: "Equipment name", required: true },
        { name: "serial", label: "Serial no" },
        { name: "start", label: "Start date", type: "date", value: offsetIso(0), required: true },
        { name: "end", label: "End date", type: "date", value: offsetIso(365), required: true },
        { name: "engineerId", label: "Engineer", options: [{ value: "", label: "Not assigned" }, ...engineers.map((e) => ({ value: e.id, label: e.name }))] },
      ]}
      onSubmit={async (v) => {
        await act(() => api.addContract(v));
        toast("Contract added with its PM schedule.");
      }}
    />
  );
}

export function EditUserModal({ user, isSelf, onClose, onSaved }) {
  const toast = useToast();
  return (
    <FormModal
      title={"Edit user: " + user.name}
      note={
        isSelf
          ? "You cannot change your own role. Leave the password blank to keep it."
          : "Leave the password blank to keep it. A new password signs the person out everywhere. Moving someone away from Engineer unassigns their contracts."
      }
      onClose={onClose}
      fields={[
        { name: "name", label: "Full name", value: user.name, required: true },
        isSelf
          ? { name: "role", label: "Role", options: [{ value: user.role, label: ROLE_LABEL[user.role] }], value: user.role }
          : { name: "role", label: "Role", options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })), value: user.role },
        { name: "password", label: "New password (optional)", type: "password" },
      ]}
      onSubmit={async (v) => {
        await api.updateUser(user.id, v);
        toast("User updated.");
        onSaved();
      }}
    />
  );
}

export function UserModal({ onClose, onSaved }) {
  const toast = useToast();
  return (
    <FormModal
      title="Add user"
      note="Minimum 8 characters for the password. The person signs in with their email."
      onClose={onClose}
      fields={[
        { name: "name", label: "Full name", required: true },
        { name: "email", label: "Email", type: "email", required: true },
        { name: "role", label: "Role", options: Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label })), value: "engineer" },
        { name: "password", label: "Password", type: "password", required: true },
      ]}
      onSubmit={async (v) => {
        await api.createUser(v);
        toast("User created.");
        onSaved();
      }}
    />
  );
}
