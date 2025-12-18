// src/routes/licenseRoutes.ts
import { Router } from "express";
import { License, firstDayOfCurrentMonth } from "../models/license";

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

    // reset period if month changed
    const now = new Date();
    const currentPeriodStart = firstDayOfCurrentMonth();
    if (license.periodStart < currentPeriodStart) {
      license.periodStart = currentPeriodStart;
      license.usedRunsThisPeriod = 0;
    }

    let remainingRuns: number;
    if (license.maxRunsPerMonth < 0) {
      // unlimited
      remainingRuns = Number.MAX_SAFE_INTEGER;
    } else {
      remainingRuns =
        license.maxRunsPerMonth - license.usedRunsThisPeriod;
    }

    if (requestedRuns > 0) {
        if (license.plan === 'trial' && requestedRuns > 3) {
            return res.status(403).json({
                valid: false,
                plan: license.plan,
                remainingRuns: Math.max(0, remainingRuns),
                message: `Trial plan allows maximum run a sales for only 3 days at a time. Please upgrade your plan.`,
            });

        }

      // enforce limit for non-unlimited plans
      if (
        license.maxRunsPerMonth >= 0 &&
        requestedRuns > remainingRuns
      ) {
        await license.save(); // save possible period reset
        return res.status(403).json({
          valid: false,
          plan: license.plan,
          remainingRuns: Math.max(0, remainingRuns),
          message: `Limit exceeded. You can create only ${Math.max(
            0,
            remainingRuns
          )} more sale(s) this month.`,
        });
      }

      // consume runs
      if (license.maxRunsPerMonth >= 0) {
        license.usedRunsThisPeriod += requestedRuns;
      }
      await license.save();
      if (license.maxRunsPerMonth < 0) {
        remainingRuns = Number.MAX_SAFE_INTEGER;
      } else {
        remainingRuns =
          license.maxRunsPerMonth - license.usedRunsThisPeriod;
      }
    } else {
      // just check, don't consume
      await license.save(); // in case we reset the period
    }

    return res.json({
      valid: true,
      plan: license.plan,
      remainingRuns:
        license.maxRunsPerMonth < 0
          ? -1
          : Math.max(0, remainingRuns),
    });
  } catch (err) {
    console.error("License check error:", err);
    return res
      .status(500)
      .json({ valid: false, message: "Server error while checking license." });
  }
});

export default router;

