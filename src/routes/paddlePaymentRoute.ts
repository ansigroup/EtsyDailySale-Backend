import { Request, Response } from "express";
import {
  CREDITS_PACK_LARGE,
  CREDITS_PACK_SMALL,
  PADDLE_PRICE2_ID,
  PADDLE_PRICE_ID,
  PADDLE_SANDBOX_PRICE2_ID,
  PADDLE_SANDBOX_PRICE_ID,
  REFERRAL_PURCHASE_BONUS_RATE,
} from "../config";
import { CreditPurchaseLog } from "../models/creditPurchaseLog";
import { License } from "../models/license";
import { ReferralEarning } from "../models/referralEarning";
import { User } from "../models/user";
import { provisionLicenseForPlan } from "../utils/licenseUtils";

function extractEmail(payload: any): string | undefined {
  if (!payload) return undefined;
  const candidates = [
    payload.email,
    payload.customer_email,
    payload.customer_email_address,
    payload?.data?.customer?.email,
    payload?.data?.customer?.email_address,
    payload?.customer?.email,
    payload?.data?.billing_details?.email,
    payload?.data?.payments?.[0]?.billing_details?.email,
    payload?.data?.payments?.[0]?.customer_email,
    payload?.data?.checkout?.customer_email,
    payload?.data?.custom_data?.email,
    payload?.data?.custom_data?.user_email,
    payload?.custom_data?.email,
    payload?.custom_data?.user_email,
  ];
  const email = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return email?.toLowerCase();
}

function extractEventType(payload: any): string | undefined {
  const candidates = [
    payload?.alert_name,
    payload?.event,
    payload?.event_name,
    payload?.eventType,
    payload?.event_type,
    payload?.type,
  ];
  const eventType = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return eventType?.toLowerCase();
}

function extractStatus(payload: any): string | undefined {
  const candidates = [payload?.status, payload?.subscription_status, payload?.data?.status];
  const status = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return status?.toLowerCase();
}

function isPaymentSuccess(eventType: string | undefined, payload: any) {
  if (!eventType) return false;
  if (
    eventType.includes("payment_succeeded") ||
    eventType.includes("payment.succeeded") ||
    eventType.includes("transaction.completed")
  ) {
    return true;
  }
  const status = extractStatus(payload);
  return eventType.includes("subscription") && status === "active";
}

function extractPriceIds(payload: any): string[] {
  const ids = new Set<string>();
  const candidates: Array<string | undefined> = [
    payload?.price_id,
    payload?.priceId,
    payload?.data?.price_id,
    payload?.data?.priceId,
  ];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      ids.add(value);
    }
  }

  const itemLists = [
    payload?.data?.items,
    payload?.items,
    payload?.data?.line_items,
    payload?.data?.checkout?.items,
    payload?.order?.items,
  ];

  for (const list of itemLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const itemCandidates: Array<string | undefined> = [
        item?.price_id,
        item?.priceId,
        item?.price?.id,
        item?.price?.price_id,
      ];
      for (const candidate of itemCandidates) {
        if (typeof candidate === "string" && candidate.trim().length > 0) {
          ids.add(candidate);
        }
      }
    }
  }

  return Array.from(ids);
}

function creditsForPriceId(priceId: string) {
  if (
    priceId === PADDLE_PRICE_ID ||
    priceId === PADDLE_SANDBOX_PRICE_ID
  ) {
    return CREDITS_PACK_SMALL;
  }
  if (
    priceId === PADDLE_PRICE2_ID ||
    priceId === PADDLE_SANDBOX_PRICE2_ID
  ) {
    return CREDITS_PACK_LARGE;
  }
  return 0;
}

async function applyCreditPurchase(email: string, payload: any) {
  const user =
    (await User.findOne({ email }).exec()) ||
    (await User.create({ email, plan: "free", subscriptionStatus: "none" }));

  let license = user.licenseKey ? await License.findOne({ key: user.licenseKey }).exec() : null;
  if (!license) {
    license = await provisionLicenseForPlan("free");
    user.licenseKey = license.key;
  }

  const priceIds = extractPriceIds(payload);
  const creditsToAdd = priceIds.reduce((total, priceId) => total + creditsForPriceId(priceId), 0);

  if (creditsToAdd <= 0) {
    console.warn("Paddle payment received without a recognized price ID", {
      email,
      eventType: extractEventType(payload),
      priceIds,
    });
    return;
  }

  user.credits = (user.credits || 0) + creditsToAdd;
  await user.save();

  await CreditPurchaseLog.create({
    email: user.email,
    credits: creditsToAdd,
    priceId: priceIds[0],
    eventId: payload?.event_id,
  });

  if (user.referrer) {
    const referrer = await User.findOne({ email: user.referrer }).exec();
    if (referrer) {
      const bonusRate = Number.isFinite(REFERRAL_PURCHASE_BONUS_RATE)
        ? REFERRAL_PURCHASE_BONUS_RATE
        : 0.1;
      const referralBonus = Math.round(creditsToAdd * bonusRate);
      if (referralBonus > 0) {
        referrer.credits = (referrer.credits || 0) + referralBonus;
        referrer.referralCreditsEarned =
          (referrer.referralCreditsEarned || 0) + referralBonus;

        const referredEmail = user.email;
        if (!referrer.paidReferralUsers?.includes(referredEmail)) {
          referrer.paidReferralUsers = [...(referrer.paidReferralUsers || []), referredEmail];
          referrer.activePaidReferrals = (referrer.activePaidReferrals || 0) + 1;
        }

        await ReferralEarning.create({
          referrerEmail: referrer.email,
          referredEmail,
          credits: referralBonus,
          source: "purchase",
          purchaseCredits: creditsToAdd,
        });

        await referrer.save();
      }
    }
  }
}

export async function paddlePaymentHandler(req: Request, res: Response) {
  console.log("!!! PADDLE HOOK: ", req.body);
  try {
    const email = extractEmail(req.body);
    const eventType = extractEventType(req.body);

    if (!email) {
      console.warn("Paddle webhook missing email", {
        eventType,
        eventId: req.body?.event_id,
        notificationId: req.body?.notification_id,
        priceIds: extractPriceIds(req.body),
      });
      return res.status(400).json({ ok: false, message: "Missing customer email" });
    }

    if (isPaymentSuccess(eventType, req.body)) {
      await applyCreditPurchase(email, req.body);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("/paddlepayment webhook error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

export default paddlePaymentHandler;
