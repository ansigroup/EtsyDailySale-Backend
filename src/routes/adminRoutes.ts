// src/routes/adminRoutes.ts
import { Router } from "express";
import { License, firstDayOfCurrentMonth } from "../models/license";
import { ADMIN_SECRET } from "../config";
import { SupportRequest } from "../models/support";
import { generateLicenseKey } from "../utils/licenseUtils";
import { sendSupportReplyEmail } from "../utils/supportEmail";


const router = Router();

// simple middleware
router.use((req, res, next) => {
  const token = req.headers["x-admin-secret"];
  if (token !== ADMIN_SECRET) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
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

