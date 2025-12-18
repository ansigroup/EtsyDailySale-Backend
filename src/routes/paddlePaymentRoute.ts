import { Request, Response } from "express";
import { License } from "../models/license";
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

function extractNextBillingDate(payload: any): Date | undefined {
  const candidates = [
    payload?.next_bill_date,
    payload?.next_payment_date,
    payload?.data?.next_payment_at,
    payload?.data?.subscription?.next_billed_at,
    payload?.next_billed_at,
  ];
  const dateString = candidates.find((value) => typeof value === "string" && value.trim().length > 0);
  return dateString ? new Date(dateString) : undefined;
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

function isSubscriptionCanceled(eventType: string | undefined, payload: any) {
  if (!eventType) return false;
  if (eventType.includes("subscription_cancelled") || eventType.includes("subscription.canceled")) {
    return true;
  }
  const status = extractStatus(payload);
  return status === "canceled" || status === "cancelled";
}

async function activateSubscription(email: string, payload: any) {
  const user =
    (await User.findOne({ email }).exec()) ||
    (await User.create({ email, plan: "free", subscriptionStatus: "none" }));

  user.plan = "full";
  user.subscriptionStatus = "active";
  user.nextBillingDate = extractNextBillingDate(payload) || new Date(Date.now() + 1000 * 60 * 60 * 24 * 30);

  let license = user.licenseKey ? await License.findOne({ key: user.licenseKey }).exec() : null;
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
}

async function cancelSubscription(email: string) {
  const user = await User.findOne({ email }).exec();
  if (!user) return;

  user.plan = "free";
  user.subscriptionStatus = "canceled";
  user.nextBillingDate = undefined;

  if (user.licenseKey) {
    const license = await License.findOne({ key: user.licenseKey }).exec();
    if (license) {
      license.plan = "trial";
      license.maxRunsPerMonth = 3;
      license.active = true;
      await license.save();
    }
  }

  await user.save();
}

export async function paddlePaymentHandler(req: Request, res: Response) {
  console.log("!!! PADDLE HOOK: ", req.body);
  try {
    const email = extractEmail(req.body);
    const eventType = extractEventType(req.body);

    if (!email) {
      return res.status(400).json({ ok: false, message: "Missing customer email" });
    }

    if (isPaymentSuccess(eventType, req.body)) {
      await activateSubscription(email, req.body);
    } else if (isSubscriptionCanceled(eventType, req.body)) {
      await cancelSubscription(email);
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("/paddlepayment webhook error", error);
    return res.status(500).json({ ok: false, message: "Server error" });
  }
}

export default paddlePaymentHandler;
