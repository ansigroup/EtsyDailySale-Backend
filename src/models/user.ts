import { Document, Schema, model } from "mongoose";

export type UserPlan = "free" | "full";
export type SubscriptionStatus = "none" | "active" | "canceled";

export interface IUser extends Document {
  email: string;
  plan: UserPlan;
  licenseKey?: string;
  subscriptionStatus: SubscriptionStatus;
  nextBillingDate?: Date | null;
  credits: number;
  referralCode?: string;
  referrer?: string;
  referredUsersCount: number;
  activePaidReferrals: number;
  monthlyReferralEarnings: number;
  referralCreditsEarned: number;
  paidReferralUsers: string[];
  magicLoginCode?: string;
  magicLoginExpiresAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    plan: { type: String, enum: ["free", "full"], default: "free" },
    licenseKey: { type: String },
    subscriptionStatus: {
      type: String,
      enum: ["none", "active", "canceled"],
      default: "none",
    },
    nextBillingDate: { type: Date },
    credits: { type: Number, default: 0 },
    referralCode: { type: String },
    referrer: { type: String },
    referredUsersCount: { type: Number, default: 0 },
    activePaidReferrals: { type: Number, default: 0 },
    monthlyReferralEarnings: { type: Number, default: 0 },
    referralCreditsEarned: { type: Number, default: 0 },
    paidReferralUsers: { type: [String], default: [] },
    magicLoginCode: { type: String },
    magicLoginExpiresAt: { type: Date },
  },
  { timestamps: true }
);

UserSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.__v;
  return obj;
};

export const User = model<IUser>("User", UserSchema);
