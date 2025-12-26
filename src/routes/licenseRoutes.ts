// src/routes/licenseRoutes.ts
import { Router } from "express";
import { CREDITS_PER_RUN } from "../config";
import { License } from "../models/license";
import { User } from "../models/user";

const router = Router();




/**
 * POST /api/license/check-and-consume
 * Body: { key: string, requestedRuns: number }
 * Response: { valid: boolean, plan?: string, remainingRuns?: number, message?: string }
 */
router.post("/check-and-consume", async (req, res) => {


console.log('consuming license', req.body);

  try {
    const { key, requestedRuns = 0 } = req.body as {
      key?: string;
      requestedRuns?: number;
    };

    if (!key) {
      return res
        .status(400)
        .json({ valid: false, message: "License key is required." });
    }


    const license = await License.findOne({ key }).exec();
    if (!license || !license.active) {
      return res
        .status(403)
        .json({ valid: false, message: "License is invalid or inactive." });
    }

    const user = await User.findOne({ licenseKey: license.key }).exec();
    if (!user) {
      return res
        .status(403)
        .json({ valid: false, message: "License is not linked to a user." });
    }

    const creditsPerRun = Number.isFinite(CREDITS_PER_RUN) && CREDITS_PER_RUN > 0
      ? Math.floor(CREDITS_PER_RUN)
      : 1;
    const currentCredits = Math.max(0, Math.floor(user.credits || 0));
    const remainingRuns = Math.floor(currentCredits / creditsPerRun);

    if (requestedRuns > 0) {
      const requiredCredits = requestedRuns * creditsPerRun;
      if (requiredCredits > currentCredits) {
        return res.status(403).json({
          valid: false,
          remainingCredits: currentCredits,
          remainingRuns: Math.max(0, remainingRuns),
          message: "Not enough credits. Please refill to continue.",
        });
      }

      user.credits = currentCredits - requiredCredits;
      await user.save();
    }

    const updatedCredits =
      requestedRuns > 0 ? Math.max(0, user.credits || 0) : currentCredits;
    const updatedRemainingRuns = Math.floor(updatedCredits / creditsPerRun);

    return res.json({
      valid: true,
      plan: license.plan,
      remainingCredits: updatedCredits,
      remainingRuns: Math.max(0, updatedRemainingRuns),
      creditsPerRun,
    });
  } catch (err) {
    console.error("License check error:", err);
    return res
      .status(500)
      .json({ valid: false, message: "Server error while checking license." });
  }
});

export default router;
