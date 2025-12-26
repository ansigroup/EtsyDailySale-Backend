import { Router } from "express";
import {
  APP_BASE_URL,
  CREDITS_PACK_LARGE,
  CREDITS_PACK_SMALL,
  CREDITS_PER_RUN,
  FREE_RUNS_ON_SIGNUP,
  REFERRAL_SIGNUP_CREDITS,
} from "../config";
import { License } from "../models/license";
import { CreditPurchaseLog } from "../models/creditPurchaseLog";
import { ReferralEarning } from "../models/referralEarning";
import { ISupportRequest, SupportRequest } from "../models/support";
import { IUser, User } from "../models/user";
import { generateLicenseKey, provisionLicenseForPlan } from "../utils/licenseUtils";
import { sendMagicLinkEmail } from "../utils/magicLinkEmail";
import { sendTelegramNotification } from "../utils/telegramBot";
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

interface EnsureUserResult {
  user: IUser;
  created: boolean;
  referrerEmail?: string;
}

async function ensureUser(email: string, ref?: string): Promise<EnsureUserResult> {
  let user = await User.findOne({ email }).exec();
  let created = false;
  if (!user) {
    let referrerEmail: string | undefined;
    if (ref) {
      const referrer = await User.findOne({ referralCode: ref }).exec();
      if (referrer) {
        referrerEmail = referrer.email;
      }
    }

    const license = await provisionLicenseForPlan("free");
    const creditsPerRun = Number.isFinite(CREDITS_PER_RUN) && CREDITS_PER_RUN > 0
      ? Math.floor(CREDITS_PER_RUN)
      : 1;
    const freeRuns = Number.isFinite(FREE_RUNS_ON_SIGNUP) && FREE_RUNS_ON_SIGNUP > 0
      ? Math.floor(FREE_RUNS_ON_SIGNUP)
      : 0;
    const startingCredits = freeRuns * creditsPerRun;

    user = await User.create({
      email,
      plan: "free",
      subscriptionStatus: "none",
      licenseKey: license.key,
      credits: startingCredits,
      referrer: referrerEmail,
    });
    created = true;
    return { user, created, referrerEmail };
  } else if (!user.licenseKey) {
    const license = await provisionLicenseForPlan(user.plan);
    user.licenseKey = license.key;
    await user.save();
  }
  return { user, created, referrerEmail: user.referrer };
}

async function notifyNewUser(user: IUser, referrerEmail?: string) {
  const referralLink = referralLinkForUser(user) || "N/A";
  const referrerText = referrerEmail ? `Referrer: ${referrerEmail}` : "Referrer: none";
  const message = [
    "🆕 New user registration",
    `Email: ${user.email}`,
    referrerText,
    `Referral link: ${referralLink}`,
  ].join("\n");

  await sendTelegramNotification(message);
}

async function notifySupportRequest(record: ISupportRequest) {
  const message = [
    "🆘 New support request",
    `Ticket ID: ${record.id}`,
    `Email: ${record.email}`,
    `Subject: ${record.subject}`,
    `Attach logs: ${record.attachLogs ? "yes" : "no"}`,
    "",
    "Message:",
    record.message,
  ].join("\n");

  await sendTelegramNotification(message);
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
    const { user, created, referrerEmail } = await ensureUser(normalizedEmail, referralCode);

    const loginCode = generateMagicLoginCode();
    user.magicLoginCode = loginCode;
    user.magicLoginExpiresAt = new Date(Date.now() + 1000 * 60 * 15);
    await user.save();

    if (created) {
      await notifyNewUser(user, referrerEmail);
    }

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

    if (user.referrer && !user.referralSignupAwarded) {
      const referrer = await User.findOne({ email: user.referrer }).exec();
      if (referrer) {
        referrer.referredUsersCount = (referrer.referredUsersCount || 0) + 1;
        const signupCredits = Number.isFinite(REFERRAL_SIGNUP_CREDITS) && REFERRAL_SIGNUP_CREDITS > 0
          ? Math.floor(REFERRAL_SIGNUP_CREDITS)
          : 0;
        if (signupCredits > 0) {
          referrer.credits = (referrer.credits || 0) + signupCredits;
          referrer.referralCreditsEarned = (referrer.referralCreditsEarned || 0) + signupCredits;
          await ReferralEarning.create({
            referrerEmail: referrer.email,
            referredEmail: user.email,
            credits: signupCredits,
            source: "signup",
          });
        }
        await referrer.save();
        user.referralSignupAwarded = true;
      }
    }

    await user.save();

    return res.json({
      ok: true,
      user: {
        email: user.email,
        plan: user.plan,
        licenseKey: user.licenseKey,
        subscriptionStatus: user.subscriptionStatus,
        nextBillingDate: user.nextBillingDate,
        credits: user.credits,
        creditsPerRun: CREDITS_PER_RUN,
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
    const { user } = await ensureUser(email);
    return res.json({
      email: user.email,
      plan: user.plan,
      licenseKey: user.licenseKey,
      subscriptionStatus: user.subscriptionStatus,
      nextBillingDate: user.nextBillingDate,
      credits: user.credits,
      creditsPerRun: CREDITS_PER_RUN,
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

    const { user } = await ensureUser(email);
    if (!user.licenseKey) {
      const license = await provisionLicenseForPlan("free");
      user.licenseKey = license.key;
      await user.save();
    }

    const requestedPackage =
      typeof req.body?.package === "string"
        ? req.body.package
        : typeof req.query?.package === "string"
          ? req.query.package
          : "small";
    const normalizedPackage = requestedPackage.toLowerCase();
    const isLargePackage = ["large", "bulk", "pro", "max"].includes(normalizedPackage);
    const selectedPriceId = isLargePackage ? paddlePrice2Id : paddlePriceId;
    const selectedCredits = isLargePackage ? CREDITS_PACK_LARGE : CREDITS_PACK_SMALL;

    if (!selectedPriceId) {
      return res.status(500).json({ ok: false, message: "Requested Paddle price is not configured" });
    }

    return res.json({
      ok: true,
      package: isLargePackage ? "large" : "small",
      credits: selectedCredits,
      data: {
        items: [
          {
            priceId: selectedPriceId,
            quantity: 1,
          },
        ],
      },
      availablePackages: [
        { key: "small", credits: CREDITS_PACK_SMALL, priceId: paddlePriceId },
        { key: "large", credits: CREDITS_PACK_LARGE, priceId: paddlePrice2Id },
      ],
    });
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
    await ensureUser(email);
    return res.json({ ok: true, message: "No subscription is active. Credits are pay-as-you-go." });
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
    const { user } = await ensureUser(email);
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

    const { user } = await ensureUser(email);

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
    const { user } = await ensureUser(email);
    if (!user.referralCode) {
      user.referralCode = generateLicenseKey("REF");
      await user.save();
    }
    return res.json({
      link: referralLinkForUser(user),
      referredUsersCount: user.referredUsersCount,
      activePaidReferrals: user.activePaidReferrals,
      totalEarnedCredits: user.referralCreditsEarned,
    });
  } catch (error) {
    console.error("/referral error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/referral/logs", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    await ensureUser(email);

    const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitParam) && limitParam && limitParam > 0
      ? Math.min(Math.floor(limitParam), 100)
      : 50;

    const logs = await ReferralEarning.find({ referrerEmail: email })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return res.json(logs);
  } catch (error) {
    console.error("/referral/logs error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.get("/credits/logs", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    await ensureUser(email);

    const limitParam = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitParam) && limitParam && limitParam > 0
      ? Math.min(Math.floor(limitParam), 100)
      : 50;

    const logs = await CreditPurchaseLog.find({ email })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec();

    return res.json(logs);
  } catch (error) {
    console.error("/credits/logs error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

router.post("/referral/generate-link", async (req, res) => {
  try {
    const email = getEmailFromRequest(req);
    if (!email) {
      return res.status(401).json({ message: "Missing user identity" });
    }
    const { user } = await ensureUser(email);
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
    await notifySupportRequest(record);
    return res.json({ ok: true, ticketId: record.id });
  } catch (error) {
    console.error("/support error", error);
    return res.status(500).json({ message: "Server error" });
  }
});

export default router;
