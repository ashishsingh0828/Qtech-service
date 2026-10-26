import mongoose from "mongoose";
import { AMC_REASONS, AMC_STATES, PM_STATES } from "../lib/constants.js";

const s = (extra = {}) => ({ type: String, default: "", maxlength: 200, ...extra });

const PmSchema = new mongoose.Schema(
  {
    date: { type: String, required: true },
    done: { type: String, default: "" },
    state: { type: String, enum: PM_STATES, default: "Scheduled" },
    ack: { type: Boolean, default: false },
    reason: { type: String, default: "", maxlength: 600 },
    plan: { type: String, default: "" },
    reportFile: { type: String, default: "" }, // stored name on disk (never sent to the browser)
    reportName: { type: String, default: "" }, // original name, used for the download
  },
  { _id: false }
);

const AmcSchema = new mongoose.Schema(
  {
    state: { type: String, enum: AMC_STATES, default: "Pending" },
    reason: { type: String, enum: AMC_REASONS, default: "" },
    remark: { type: String, default: "", maxlength: 500 },
    date: { type: String, default: "" },
    doc: { type: String, default: "" }, // original file name shown in the UI
    docFile: { type: String, default: "" }, // stored name on disk
  },
  { _id: false }
);

const ContractSchema = new mongoose.Schema(
  {
    cust: s({ required: true }),
    city: s(),
    contact: s(),
    mobile: s({ maxlength: 30 }),
    mail: s(),
    loc: s(),
    type: s(),
    equip: s({ required: true }),
    serial: s(),
    start: { type: String, required: true },
    end: { type: String, required: true },
    engineer: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    valid: { type: String, enum: ["Yes", "No"], default: "No" },
    vby: s(),
    vdue: { type: String, default: "" },
    amc: { type: AmcSchema, default: () => ({}) },
    pms: { type: [PmSchema], default: [] },
  },
  {
    timestamps: true,
    toJSON: {
      // Same shape the frontend already uses: id, engineerId, plain pms and amc.
      transform(_doc, ret) {
        ret.id = String(ret._id);
        ret.engineerId = ret.engineer ? String(ret.engineer) : "";
        ret.pms = (ret.pms || []).map(({ reportFile, reportName, ...p }) => ({ ...p, hasReport: Boolean(reportFile) }));
        if (ret.amc) delete ret.amc.docFile;
        delete ret._id;
        delete ret.__v;
        delete ret.engineer;
        delete ret.createdAt;
        delete ret.updatedAt;
        return ret;
      },
    },
  }
);

export const Contract = mongoose.models.Contract || mongoose.model("Contract", ContractSchema);
