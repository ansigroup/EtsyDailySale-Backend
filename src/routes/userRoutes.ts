import { Router } from "express";
import { APP_BASE_URL } from "../config";
import { License } from "../models/license";
import { SupportRequest } from "../models/support";
import { IUser, User } from "../models/user";
import { generateLicenseKey, provisionLicenseForPlan } from "../utils/licenseUtils";
import { sendMagicLinkEmail } from "../utils/magicLinkEmail";
import {
  price2IdForEnvironment,
  priceIdForEnvironment,
  resolvePaddleEnvironmentFromRequest,
} from "../utils/paddleClient";

const router = Router();

function generateMagicLoginCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getEmailFromRequest(req: any) {
  const headerEmail = req.headers["x-user-email"];
  if (typeof headerEmail === "string" && headerEmail.trim().length > 0) {
    return headerEmail.toLowerCase();
  }
  if (typeof req.query.email === "string") {
    return (req.query.email as string).toLowerCase();
  }
  return undefined;
}

async function ensureUser(email: string, ref?: string): Promise<IUser> {
  let user = await User.findOne({ email }).exec();
  if (!user) {
    let referrerEmail: string | undefined;
    if (ref) {
      const referrer = await User.findOne({ referralCode: ref }).exec();
      if (referrer) {
        referrerEmail = referrer.email;
        referrer.referredUsersCount = (referrer.referredUsersCount || 0) + 1;
        await referrer.save();
      }
    }

    const license = await provisionLicenseForPlan("free");
    user = await User.create({
      email,
      plan: "free",
      subscriptionStatus: "none",
      licenseKey: license.key,
      referrer: referrerEmail,
    });
  } else if (!user.licenseKey) {
    const license = await provisionLicenseForPlan(user.plan);
    user.licenseKey = license.key;
    await user.save();
  }
  return user;
}

function referralLinkForUser(user: IUser) {
  const code = user.referralCode;
  if (!code) return undefined;
  return `${APP_BASE_URL}?ref=${code}`;
}

router.post("/auth/request-magic-link", async (req, res) => {
  try {
    const { email, ref } = req.body || {};
    if (!email || typeof email !== "string") {
      return res.status(400).json({ ok: false, message: "Email is required" });
    }

    const normalizedEmail = email.toLowerCase();
    const referralCode = typeof ref === "string" && ref.trim().length > 0 ? ref : undefined;
    const user = await ensureUser(normalizedEmail, referralCode);

    const loginCode = generateMagicLoginCode();
    user.magicLoginCode = loginCode;
    user.magicLoginExpiresAt = new Date(Date.now() + 1000 * 60 * 15);
    await user.save();

    const { sent, loginUrl } = await sendMagicLinkEmail(normalizedEmail, loginCode);

    return res.json({ ok: true, emailSent: sent, loginUrl, loginCode });
  } catch (error) {
    console.error("request-magic-link error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.post("/auth/magic-login", async (req, res) => {
  console.log("Verifying magic link with body:", req.body);
  try {
    const { email, code } = req.body || {};
    if (!email || typeof email !== "string" || !code || typeof code !== "string") {
      return res.status(400).json({ ok: false, message: "Email and code are required" });
    }

    const normalizedEmail = email.toLowerCase();
    const user = await User.findOne({ email: normalizedEmail }).exec();

    if (!user || !user.magicLoginCode || !user.magicLoginExpiresAt) {
      return res.status(400).json({ ok: false, message: "Invalid login link" });
    }

    const isExpired = user.magicLoginExpiresAt.getTime() < Date.now();
    if (isExpired || user.magicLoginCode !== code) {
      return res.status(400).json({ ok: false, message: "Invalid or expired code" });
    }

    user.magicLoginCode = undefined;
    user.magicLoginExpiresAt = undefined;
    await user.save();

    return res.json({
      ok: true,
      user: {
        email: user.email,
        plan: user.plan,
        licenseKey: user.licenseKey,
        subscriptionStatus: user.subscriptionStatus,
        nextBillingDate: user.nextBillingDate,
      },
    });
  } catch (error) {
    console.error("verify-magic-link error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/me", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    const user = await ensureUser(email);
    return res.json({
      email: user.email,
      plan: user.plan,
      licenseKey: user.licenseKey,
      subscriptionStatus: user.subscriptionStatus,
      nextBillingDate: user.nextBillingDate,
    });
  } catch (error) {
    console.error("/me error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/subscription/create", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }

    const environment = resolvePaddleEnvironmentFromRequest(req.body || req.query);
    const paddlePriceId = priceIdForEnvironment(environment);
    const paddlePrice2Id = price2IdForEnvironment(environment);

    if (!paddlePriceId) {
      return res.status(500).json({ ok: false, message: "Paddle price ID is not configured" });
    }

    const user = await ensureUser(email);

    user.plan = "full";
    user.subscriptionStatus = "active";
    user.nextBillingDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

    let license = await License.findOne({ key: user.licenseKey }).exec();
    if (!license) {
      license = await provisionLicenseForPlan("full");
      user.licenseKey = license.key;
    } else {
      license.plan = "pro";
      license.maxRunsPerMonth = -1;
      license.active = true;
      await license.save();
    }

    await user.save();

    //return res.json({ ok: true, priceId: paddlePriceId });
    return res.json({ ok: true, data: {
         items: [
          {
            priceId: paddlePriceId,
            quantity: 1
          }
          //,
          // {
          //   priceId: paddlePrice2Id,
          //   quantity: 1
          // }
          ]
      } });
  } catch (error) {
    console.error("/subscription/create error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.post("/subscription/cancel", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    const user = await ensureUser(email);
    user.plan = "free";
    user.subscriptionStatus = "canceled";
    user.nextBillingDate = undefined;

    const license = await License.findOne({ key: user.licenseKey }).exec();
    if (license) {
      license.plan = "trial";
      license.maxRunsPerMonth = 3;
      license.active = true;
      await license.save();
    }

    await user.save();
    return res.json({ ok: true });
  } catch (error) {
    console.error("/subscription/cancel error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/license", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    const user = await ensureUser(email);
    const license = await License.findOne({ key: user.licenseKey }).exec();
    if (!license) {
      return res.status(404).json({ message: "License not found" });
    }
    return res.json(license);
  } catch (error) {
    console.error("/license error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/license/regenerate", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }

    const user = await ensureUser(email);

    if (user.licenseKey) {
      await License.updateOne({ key: user.licenseKey }, { active: false }).exec();
    }

    const license = await provisionLicenseForPlan(user.plan);
    user.licenseKey = license.key;
    await user.save();

    return res.json({ ok: true, license });
  } catch (error) {
    console.error("/license/regenerate error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
});

router.get("/referral", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    const user = await ensureUser(email);
    if (!user.referralCode) {
      user.referralCode = generateLicenseKey("REF");
      await user.save();
    }
    return res.json({
      link: referralLinkForUser(user),
      referredUsersCount: user.referredUsersCount,
      activePaidReferrals: user.activePaidReferrals,
      monthlyReferralEarnings: user.monthlyReferralEarnings,
    });
  } catch (error) {
    console.error("/referral error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/referral/generate-link", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    const user = await ensureUser(email);
    user.referralCode = generateLicenseKey("REF");
    await user.save();

    return res.json({ link: referralLinkForUser(user) });
  } catch (error) {
    console.error("/referral/generate-link error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/support", async (req, res) => {
  try {
    const email = getEmailFromRequest(req) || req.body?.email;
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    const { subject, message, attachLogs = false } = req.body || {};
    if (!subject || !message) {
      return res.status(400).json({ message: "Subject and message are required" });
    }

    const record = await SupportRequest.create({ email, subject, message, attachLogs });
    return res.json({ ok: true, ticketId: record.id });
  } catch (error) {
    console.error("/support error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
