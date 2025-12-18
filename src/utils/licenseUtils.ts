import crypto from "crypto";
import { License, firstDayOfCurrentMonth, ILicense } from "../models/license";

export function generateLicenseKey(prefix = "") {
  const part = () => crypto.randomBytes(3).toString("hex").toUpperCase();
  return `${part()}-${part()}-${part()}`;
}

export async function provisionLicenseForPlan(plan: "free" | "full") {
  const isFull = plan === "full";
  const licensePlan: ILicense["plan"] = isFull ? "pro" : "trial";
  const key = generateLicenseKey(isFull ? "FULL" : "TRIAL");

  const license = await License.create({
    key,
    plan: licensePlan,
    maxRunsPerMonth: isFull ? -1 : 3,
    active: true,
    usedRunsThisPeriod: 0,
    periodStart: firstDayOfCurrentMonth(),
  });

  return license;
}
