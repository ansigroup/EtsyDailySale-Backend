// src/routes/adminRoutes.ts
import { Router } from "express";
import { CreditPurchaseLog } from "../models/creditPurchaseLog";
import { License, firstDayOfCurrentMonth } from "../models/license";
import { ReferralEarning } from "../models/referralEarning";
import { User } from "../models/user";
import { ADMIN_SECRET } from "../config";
import { SupportRequest } from "../models/support";
import { generateLicenseKey } from "../utils/licenseUtils";
import { sendSupportReplyEmail } from "../utils/supportEmail";


const router = Router();

// simple middleware
router.use(async (req, res, next) => {
  const token = req.headers["x-admin-secret"];
  if (token !== ADMIN_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  const emailHeader = req.headers["x-user-email"];
  const email =
    typeof emailHeader === "string" && emailHeader.trim().length > 0
      ? emailHeader.toLowerCase()
      : undefined;
  if (!email) {
    return res.status(401).json({ message: "Missing admin identity" });
  }
  const adminUser = await User.findOne({ email }).exec();
  if (!adminUser || !adminUser.isAdmin) {
    return res.status(403).json({ message: "Forbidden" });
  }
  res.locals.adminUser = adminUser;
  next();
});

router.get("/users", async (req, res) => {
  try {
    const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitParam) && limitParam && limitParam > 0
      ? Math.min(Math.floor(limitParam), 200)
      : 100;
    const skipParam = typeof req.query.skip === "string" ? Number(req.query.skip) : 0;
    const skip = Number.isFinite(skipParam) && skipParam && skipParam > 0 ? Math.floor(skipParam) : 0;
    const search =
      typeof req.query.q === "string" && req.query.q.trim().length > 0
        ? req.query.q.trim()
        : undefined;

    const filter = search
      ? { email: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" } }
      : {};

    const users = await User.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
    const total = await User.countDocuments(filter).exec();

    return res.json({
      total,
      users: users.map((user) => ({
        id: user.id,
        email: user.email,
        credits: user.credits || 0,
        licenseKey: user.licenseKey,
        referrer: user.referrer,
        referredUsersCount: user.referredUsersCount,
        activePaidReferrals: user.activePaidReferrals,
        referralCreditsEarned: user.referralCreditsEarned,
        isAdmin: user.isAdmin,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    });
  } catch (error) {
    console.error("/admin/users error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { creditsDelta, credits, isAdmin, licenseKey } = req.body || {};
    const user = await User.findById(id).exec();
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (typeof credits === "number" && Number.isFinite(credits)) {
      user.credits = Math.floor(credits);
    } else if (typeof creditsDelta === "number" && Number.isFinite(creditsDelta)) {
      user.credits = (user.credits || 0) + Math.floor(creditsDelta);
    }

    if (typeof isAdmin === "boolean") {
      user.isAdmin = isAdmin;
    }

    if (typeof licenseKey === "string" && licenseKey.trim().length > 0) {
      user.licenseKey = licenseKey.trim();
    }

    await user.save();
    return res.json({
      id: user.id,
      email: user.email,
      credits: user.credits || 0,
      licenseKey: user.licenseKey,
      referrer: user.referrer,
      referredUsersCount: user.referredUsersCount,
      activePaidReferrals: user.activePaidReferrals,
      referralCreditsEarned: user.referralCreditsEarned,
      isAdmin: user.isAdmin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    });
  } catch (error) {
    console.error("/admin/users/:id error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/referrals/logs", async (req, res) => {
  try {
    const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitParam) && limitParam && limitParam > 0
      ? Math.min(Math.floor(limitParam), 200)
      : 100;
    const skipParam = typeof req.query.skip === "string" ? Number(req.query.skip) : 0;
    const skip = Number.isFinite(skipParam) && skipParam && skipParam > 0 ? Math.floor(skipParam) : 0;

    const logs = await ReferralEarning.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return res.json(logs);
  } catch (error) {
    console.error("/admin/referrals/logs error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/credits/logs", async (req, res) => {
  try {
    const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitParam) && limitParam && limitParam > 0
      ? Math.min(Math.floor(limitParam), 200)
      : 100;
    const skipParam = typeof req.query.skip === "string" ? Number(req.query.skip) : 0;
    const skip = Number.isFinite(skipParam) && skipParam && skipParam > 0 ? Math.floor(skipParam) : 0;

    const logs = await CreditPurchaseLog.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec();

    return res.json(logs);
  } catch (error) {
    console.error("/admin/credits/logs error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/stats/global", async (_req, res) => {
  try {
    const [userCount, totals] = await Promise.all([
      User.countDocuments().exec(),
      User.aggregate([
        {
          $group: {
            _id: null,
            totalCreditsOutstanding: { $sum: "$credits" },
            totalReferralCredits: { $sum: "$referralCreditsEarned" },
            totalPaidReferrals: { $sum: "$activePaidReferrals" },
          },
        },
      ]),
    ]);

    const summary = totals[0] || {
      totalCreditsOutstanding: 0,
      totalReferralCredits: 0,
      totalPaidReferrals: 0,
    };

    return res.json({
      totalUsers: userCount,
      totalCreditsOutstanding: summary.totalCreditsOutstanding || 0,
      totalReferralCredits: summary.totalReferralCredits || 0,
      totalPaidReferrals: summary.totalPaidReferrals || 0,
    });
  } catch (error) {
    console.error("/admin/stats/global error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/stats/payments", async (req, res) => {
  try {
    const start =
      typeof req.query.start === "string" && req.query.start.trim().length > 0
        ? new Date(req.query.start)
        : undefined;
    const end =
      typeof req.query.end === "string" && req.query.end.trim().length > 0
        ? new Date(req.query.end)
        : undefined;

    const match: Record<string, any> = {};
    if (start || end) {
      match.createdAt = {};
      if (start) match.createdAt.$gte = start;
      if (end) match.createdAt.$lte = end;
    }

    const [totals, byCredits] = await Promise.all([
      CreditPurchaseLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: 1 },
            totalCreditsSold: { $sum: "$credits" },
          },
        },
      ]),
      CreditPurchaseLog.aggregate([
        { $match: match },
        {
          $group: {
            _id: "$credits",
            count: { $sum: 1 },
            totalCredits: { $sum: "$credits" },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const summary = totals[0] || { totalPurchases: 0, totalCreditsSold: 0 };

    return res.json({
      totalPurchases: summary.totalPurchases || 0,
      totalCreditsSold: summary.totalCreditsSold || 0,
      byCredits,
    });
  } catch (error) {
    console.error("/admin/stats/payments error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/license
 * Body: { key, plan?, maxRunsPerMonth? }
 */
router.post("/license", async (req, res) => {
  try {
    let { key, plan = "trial", maxRunsPerMonth = 3 } = req.body || {};


    // 🔥 Auto-generate key if none provided
    if (!key || typeof key !== "string" || key.trim().length === 0) {
      key = generateLicenseKey(plan.toUpperCase());
    }

    const existing = await License.findOne({ key }).exec();
    if (existing) {
      return res.status(409).json({ message: "License with this key already exists" });
    }

    const license = await License.create({
      key,
      plan,
      maxRunsPerMonth,
      active: true,
      usedRunsThisPeriod: 0,
      periodStart: firstDayOfCurrentMonth(),
    });

    return res.status(201).json(license);
  } catch (e) {
    console.error("Create license error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

/**
 * GET /api/admin/licenses
 */
router.get("/licenses", async (_req, res) => {
  const licenses = await License.find().sort({ createdAt: -1 }).exec();
  res.json(licenses);
});

/**
 * PATCH /api/admin/license/:key
 * Body: { active?, maxRunsPerMonth?, plan? }
 */
router.patch("/license/:key", async (req, res) => {
  try {
    const { key } = req.params;
    const { active, maxRunsPerMonth, plan } = req.body || {};

    const license = await License.findOne({ key }).exec();
    if (!license) {
      return res.status(404).json({ message: "License not found" });
    }

    if (typeof active === "boolean") license.active = active;
    if (typeof maxRunsPerMonth === "number") license.maxRunsPerMonth = maxRunsPerMonth;
    if (plan) license.plan = plan;

    await license.save();
    res.json(license);
  } catch (e) {
    console.error("Update license error:", e);
    res.status(500).json({ message: "Server error" });
  }
});

/**
 * POST /api/admin/support/:id/reply
 * Body: { message, subject? }
 */
router.post("/support/:id/reply", async (req, res) => {
  try {
    const { id } = req.params;
    const { message, subject } = req.body || {};

    if (!message || typeof message !== "string") {
      return res.status(400).json({ message: "Reply message is required" });
    }

    const supportRequest = await SupportRequest.findById(id).exec();
    if (!supportRequest) {
      return res.status(404).json({ message: "Support ticket not found" });
    }

    const emailSubject = typeof subject === "string" && subject.trim().length > 0
      ? subject
      : `Re: ${supportRequest.subject}`;

    const { sent } = await sendSupportReplyEmail(
      supportRequest.email,
      emailSubject,
      message
    );

    return res.json({ ok: true, emailSent: sent });
  } catch (e) {
    console.error("Send support reply error:", e);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
