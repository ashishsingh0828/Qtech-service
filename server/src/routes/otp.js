import { Router } from "express";
import { Contract } from "../models/Contract.js";
import { HttpError, asyncHandler } from "../lib/errors.js";
import { canAccessContract } from "../lib/policy.js";
import { isObjectId, parseIndex } from "../lib/validate.js";
import { requirePermission } from "../middleware/auth.js";
import { issueOtp, otpKey } from "../services/otp.js";

const router = Router();

router.post(
  "/",
  requirePermission("requestOtp"),
  asyncHandler(async (req, res) => {
    const { contractId, pmIndex } = req.body || {};
    if (!isObjectId(contractId)) throw new HttpError(404, "Contract not found.");

    const contract = await Contract.findById(contractId);
    if (!contract || !canAccessContract(req.user, contract)) throw new HttpError(404, "Contract not found.");

    let index;
    if (pmIndex !== undefined && pmIndex !== null) {
      index = parseIndex(pmIndex, contract.pms.length);
      if (index < 0) throw new HttpError(404, "PM not found.");
    }
    if (!contract.mobile && !contract.mail) throw new HttpError(400, "This contract has no customer mobile or email to send an OTP to.");

    res.json(await issueOtp({ key: otpKey(contract.id, index), contract }));
  })
);

export default router;
